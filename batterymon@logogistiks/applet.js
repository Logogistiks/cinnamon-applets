const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const Settings = imports.ui.settings;

const Base = imports.applets["batterymon@logogistiks"].shared.appletBase;

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


class BatteryApplet extends Base.IconTwoLineApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(metadata, orientation, panelHeight, instanceId, {
            widthFactor: 0.48,
            minWidth: 14,
            minHeight: 18,
            heightPadding: 8
        });

        this._textBox.set_style("padding-left: 3px;");
        this._topLabel.set_text("??%");
        this._botLabel.set_text("");

        this._devices = [];
        this._deviceSignals = [];
        this._batteryPaths = [];
        this._batteryData = null;
        this._label = this._topLabel;
        this._timeLabel = this._botLabel;

        this._settings = new Settings.AppletSettings(
            this,
            metadata.uuid,
            instanceId
        );
        this._settings.bind(
            "show-icon",
            "_showIcon",
            this._updateIconVisibility
        );
        this._settings.bind(
            "critical-threshold",
            "_critThreshold",
            this._update
        );
        this._settings.bind(
            "remaining-format",
            "_remainingFormat",
            this._update
        );
        this._settings.bind(
            "label-alignment",
            "_labelAlignment",
            this._applyAlignment
        );

        this._connectUPower();
        this._update();
        this._startTimer(UPDATE_INTERVAL);
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


    _update() {
        let data = this._getBatteryData();

        this._batteryData = data;
        this._batteryPaths = data.details.map(b => b.path);

        let percentage = Math.round(data.percentage);

        this._label.set_text(percentage + "%");

        this._label.set_style(
            percentage <= this._critThreshold ? "color: #f50000;" : null
        );

        let runtime = this._getRuntimeText(data);

        this._timeLabel.set_text(this._getPanelRuntimeText(runtime));

        let tooltip = this._buildTooltip(data);

        this.set_applet_tooltip(tooltip);

        this._queueIconRepaint();

        this._applyAlignment();
    }


    _getPanelRuntimeText(runtime) {
        if (runtime === null)
            return "";

        return runtime
            .replace("Remaining: ", "")
            .replace("Until full: ", "");
    }

    /*
     * Construct the tooltip text.
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
     * Format hours using the configured strftime format.
     */
    _formatDuration(hours) {
        if (!isFinite(hours) || hours < 0)
            return "unknown";

        let seconds = Math.round(hours * 60 * 60);
        let dateTime = GLib.DateTime.new_from_unix_utc(seconds);

        return dateTime.format(this._remainingFormat);
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


    draw(area) {
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


    on_applet_removed_from_panel() {
        for (let signal of this._deviceSignals) {
            try {
                signal.proxy.disconnect(signal.id);
            } catch (e) {
                // Device may already have disappeared.
            }
        }

        this._deviceSignals = [];
        this._devices = [];

        super.on_applet_removed_from_panel();
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


    on_settings_infobutton() {
        let url = "https://docs.python.org/3.6/library/datetime.html#strftime-and-strptime-behavior";
        Gio.AppInfo.launch_default_for_uri(url, null);
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
