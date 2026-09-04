const Applet = imports.ui.applet;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;

const UPOWER_BUS = "org.freedesktop.UPower";
const UPOWER_PATH = "/org/freedesktop/UPower";
const UPOWER_IFACE = "org.freedesktop.UPower";
const DEVICE_IFACE = "org.freedesktop.UPower.Device";
const DEVICE_TYPE_BATTERY = 2;

// UPower DeviceState enum
const STATE_UNKNOWN = 0;
const STATE_CHARGING = 1;
const STATE_DISCHARGING = 2;
const STATE_EMPTY = 3;
const STATE_FULLY_CHARGED = 4;
const STATE_PENDING_CHARGE = 5;
const STATE_PENDING_DISCHARGE = 6;

// Update periodically as a fallback. Property-change signals normally
// update the applet immediately.
const UPDATE_INTERVAL = 30;


class BatteryApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._devices = [];
        this._deviceSignals = [];
        this._updateTimer = null;
        this._batteryPaths = [];
        this._batteryData = null;

        this._box = new St.BoxLayout({
            vertical: false,
            style_class: "my-battery-box"
        });

        // Vertical battery icon first
        this._icon = new St.DrawingArea({
            width: Math.max(14, Math.floor(panelHeight * 0.48)),
            height: Math.max(18, panelHeight - 8)
        });

        this._icon.connect(
            "repaint",
            this._drawBattery.bind(this)
        );

        // Text goes to the right of the icon
        this._textBox = new St.BoxLayout({
            vertical: true,
            style: "padding-left: 3px;"
        });

        this._label = new St.Label({
            text: "??%"
        });

        this._timeLabel = new St.Label({
            text: ""
        });

        this._textBox.add_child(this._label);
        this._textBox.add_child(this._timeLabel);

        this._box.add_child(this._icon);
        this._box.add_child(this._textBox);

        this.actor.add_child(this._box);

        this.set_applet_tooltip("Battery");

        this._connectUPower();
        this._startTimer();
    }


    /*
     * Create a proxy for the UPower daemon and enumerate all devices.
     */
    _connectUPower() {
        try {
            this._upower = Gio.DBusProxy.new_sync(
                Gio.DBus.system,
                Gio.DBusProxyFlags.NONE,
                null,
                UPOWER_BUS,
                UPOWER_PATH,
                UPOWER_IFACE,
                null
            );

            this._enumerateDevices();
        } catch (e) {
            global.logError("My Battery: Failed to connect to UPower: " + e);
            this._label.set_text("?");
        }
    }


    /*
     * Ask UPower for all device object paths and keep only batteries.
     *
     * We deliberately do not assume BAT0/BAT1. This also works if the
     * machine has differently named batteries.
     */
    _enumerateDevices() {
        try {
            let result = this._upower.call_sync(
                "EnumerateDevices",
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );

            let paths = result.deep_unpack()[0];

            for (let path of paths) {
                this._addDevice(path);
            }

            this._update();
        } catch (e) {
            global.logError(
                "My Battery: Failed to enumerate UPower devices: " + e
            );
        }
    }


    /*
     * Add a UPower device if it is actually a battery.
     */
    _addDevice(path) {
        try {
            let proxy = Gio.DBusProxy.new_sync(
                Gio.DBus.system,
                Gio.DBusProxyFlags.NONE,
                null,
                UPOWER_BUS,
                path,
                DEVICE_IFACE,
                null
            );

            let type = proxy.get_cached_property("Type");

            if (type === null)
                return;

            if (type.deep_unpack() !== DEVICE_TYPE_BATTERY)
                return;

            let signalId = proxy.connect(
                "g-properties-changed",
                () => {
                    this._update();
                }
            );

            this._devices.push(proxy);
            this._deviceSignals.push({
                proxy: proxy,
                id: signalId
            });
        } catch (e) {
            global.logError(
                "My Battery: Failed to add device " + path + ": " + e
            );
        }
    }


    /*
     * Safely obtain a UPower property.
     */
    _getProperty(proxy, name, defaultValue) {
        let value = proxy.get_cached_property(name);

        if (value === null)
            return defaultValue;

        try {
            return value.deep_unpack();
        } catch (e) {
            return defaultValue;
        }
    }


    /*
     * Calculate the combined battery state.
     *
     * Percentage is energy-weighted:
     *
     *   sum(Energy) / sum(EnergyFull)
     *
     * rather than averaging the individual percentages.
     */
    _getBatteryData() {
        let totalEnergy = 0;
        let totalFull = 0;

        let dischargeRate = 0;
        let chargeRate = 0;

        let hasDischarging = false;
        let hasCharging = false;

        let details = [];

        for (let device of this._devices) {
            let present = this._getProperty(device, "IsPresent", true);

            if (!present)
                continue;

            let energy = this._getProperty(device, "Energy", 0);
            let energyFull = this._getProperty(device, "EnergyFull", 0);
            let energyRate = this._getProperty(device, "EnergyRate", 0);
            let percentage = this._getProperty(device, "Percentage", 0);
            let state = this._getProperty(
                device,
                "State",
                STATE_UNKNOWN
            );

            /*
             * Some devices can briefly report zero/invalid values.
             */
            if (energyFull > 0) {
                totalEnergy += Math.max(0, energy);
                totalFull += Math.max(0, energyFull);
            }

            if (state === STATE_DISCHARGING) {
                hasDischarging = true;
                dischargeRate += Math.max(0, energyRate);
            } else if (state === STATE_CHARGING) {
                hasCharging = true;
                chargeRate += Math.max(0, energyRate);
            }

            details.push({
                path: device.get_object_path(),
                energy: energy,
                energyFull: energyFull,
                energyRate: energyRate,
                percentage: percentage,
                state: state
            });
        }

        let percentage = 0;

        if (totalFull > 0) {
            percentage = 100 * totalEnergy / totalFull;
        }

        /*
         * Clamp against tiny floating-point / UPower inconsistencies.
         */
        percentage = Math.max(0, Math.min(100, percentage));

        return {
            energy: totalEnergy,
            full: totalFull,
            percentage: percentage,
            dischargeRate: dischargeRate,
            chargeRate: chargeRate,
            hasDischarging: hasDischarging,
            hasCharging: hasCharging,
            details: details
        };
    }


    /*
     * Update text, tooltip and icon.
     */
    _update() {
        let data = this._getBatteryData();

        this._batteryData = data;
        this._batteryPaths = data.details.map(b => b.path);

        let percentage = Math.round(data.percentage);

        this._label.set_text(percentage + "%");

        this._label.set_style(
            percentage <= 8 ? "color: #f50000;" : null
        );

        let runtime = this._getRuntimeText(data);

        this._timeLabel.set_text(this._getPanelRuntimeText(runtime));

        let tooltip = this._buildTooltip(data);

        this.set_applet_tooltip(tooltip);

        this._icon.queue_repaint();
    }


    _getPanelRuntimeText(runtime) {
        if (runtime === null)
            return "";

        return runtime
            .replace("Remaining: ", "")
            .replace("Until full: ", "");
    }

    /*
     * Construct the tooltip.
     */
    _buildTooltip(data) {
        let lines = [];

        for (let b of data.details) {
            let name = this._getBatteryName(b.path);
            let state = this._stateToString(b.state);

            let line =
                name +
                ": " +
                Math.round(b.percentage) +
                "%";

            if (b.energyFull > 0) {
                line +=
                    " (" +
                    b.energy.toFixed(2) +
                    " / " +
                    b.energyFull.toFixed(2) +
                    " Wh)";
            }

            line += " — " + state;

            lines.push(line);
        }

        return lines.join("\n");
    }

    /*
     * Extract the human-readable BAT0/BAT1 name from the UPower path.
     */
    _getBatteryName(path) {
        let parts = path.split("/");

        if (parts.length === 0)
            return "Battery";

        let name = parts[parts.length - 1];

        if (name.indexOf("battery_") === 0) {
            return name.substring("battery_".length);
        }

        return name;
    }


    /*
     * Calculate an estimate from the batteries which are actually
     * discharging/charging.
     *
     * For discharge:
     *
     *   remaining time = energy / discharge power
     *
     * This reproduces UPower's result for your BAT0:
     *
     *   14.71 Wh / 6.687 W ~= 2.20 h
     */
    _getRuntimeText(data) {
        if (data.hasDischarging && data.dischargeRate > 0) {
            let hours = data.energy / data.dischargeRate;

            return "Remaining: " + this._formatDuration(hours);
        }

        /*
         * If nothing is discharging but something is charging,
         * estimate time until the total energy reaches total full energy.
         */
        if (data.hasCharging && data.chargeRate > 0) {
            let remaining = Math.max(0, data.full - data.energy);
            let hours = remaining / data.chargeRate;

            return "Until full: " + this._formatDuration(hours);
        }

        /*
         * All batteries are full.
         */
        if (data.full > 0 &&
            data.energy >= data.full * 0.999) {
            return "Fully charged";
        }

        return null;
    }


    /*
     * Format hours into something similar to the Cinnamon battery applet.
     */
    _formatDuration(hours) {
        if (!isFinite(hours) || hours < 0)
            return "unknown";

        let totalMinutes = Math.round(hours * 60);

        let h = Math.floor(totalMinutes / 60);
        let m = totalMinutes % 60;

        if (h > 0) {
            if (m === 0)
                return h + "h";

            return h + "h " + m + "m";
        }

        return m + "m";
    }


    _stateToString(state) {
        switch (state) {
        case STATE_CHARGING:
            return "charging";

        case STATE_DISCHARGING:
            return "discharging";

        case STATE_EMPTY:
            return "empty";

        case STATE_FULLY_CHARGED:
            return "fully charged";

        case STATE_PENDING_CHARGE:
            return "pending charge";

        case STATE_PENDING_DISCHARGE:
            return "pending discharge";

        default:
            return "unknown";
        }
    }


    /*
     * Draw the battery icon using Cairo.
     *
     * The fill corresponds to the combined energy percentage.
     */
    _drawBattery(area) {
        let cr = area.get_context();

        let width = area.width;
        let height = area.height;

        cr.setOperator(0);
        cr.paint();

        cr.setOperator(2);

        let data = this._batteryData || this._getBatteryData();
        let percentage = Math.max(
            0,
            Math.min(1, data.percentage / 100)
        );

        /*
         * Leave a few pixels of space above and below the battery.
         */
        let verticalPadding = 6;

        let terminalHeight = Math.max(2, height * 0.08);
        let terminalWidth = width * 0.38;

        let bodyX = 1;
        let bodyY = verticalPadding + terminalHeight;
        let bodyWidth = width - 2;
        let bodyHeight =
            height - (verticalPadding * 2) - terminalHeight;

        let innerPadding = 2;

        /*
         * Battery outline.
         */
        cr.setLineWidth(1.5);
        cr.setSourceRGBA(1, 1, 1, 1);

        cr.rectangle(
            bodyX + 0.75,
            bodyY + 0.75,
            bodyWidth - 1.5,
            bodyHeight - 1.5
        );

        cr.stroke();

        /*
         * Fill from bottom to top.
         */
        let innerX = bodyX + innerPadding;
        let innerY = bodyY + innerPadding;

        let innerWidth = bodyWidth - innerPadding * 2;
        let innerHeight = bodyHeight - innerPadding * 2;

        let fillHeight = innerHeight * percentage;

        if (fillHeight > 0) {
            cr.rectangle(
                innerX,
                innerY + innerHeight - fillHeight,
                innerWidth,
                fillHeight
            );

            cr.fill();
        }

        /*
         * Terminal.
         */
        let terminalX =
            bodyX + (bodyWidth - terminalWidth) / 2;

        cr.rectangle(
            terminalX,
            verticalPadding,
            terminalWidth,
            terminalHeight
        );

        cr.fill();

        cr.$dispose();
    }

    /*
     * Periodic fallback update.
     */
    _startTimer() {
        this._updateTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            UPDATE_INTERVAL,
            () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }


    /*
     * Cinnamon calls this when the applet is removed.
     */
    on_applet_removed_from_panel() {
        if (this._updateTimer !== null) {
            GLib.source_remove(this._updateTimer);
            this._updateTimer = null;
        }

        for (let signal of this._deviceSignals) {
            try {
                signal.proxy.disconnect(signal.id);
            } catch (e) {
                // Device may already have disappeared.
            }
        }

        this._deviceSignals = [];
        this._devices = [];
    }


    on_applet_clicked(event) {
        this._openBatteryTerminal();
    }


    _openBatteryTerminal() {
        if (!this._batteryPaths || this._batteryPaths.length === 0) {
            return;
        }

        let commands = [];

        for (let path of this._batteryPaths) {
            commands.push("echo '===== " + path + " ====='");
            commands.push("upower -i " + path);
        }

        commands.push("read -p 'Press Enter to close...'");

        Util.spawnCommandLine(
            "gnome-terminal -- bash -c \"" + commands.join("; ") + "\""
        );
    }
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new BatteryApplet(
        metadata,
        orientation,
        panelHeight,
        instanceId
    );
}
