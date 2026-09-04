const Applet = imports.ui.applet;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Util = imports.misc.util;

const HWMON_PATH = "/sys/class/hwmon";
const UPDATE_INTERVAL = 5;


class FanApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._updateTimer = null;
        this._fanPath = this._findFanPath();
        this._rpm = null;

        this._box = new St.BoxLayout({
            vertical: false,
            style_class: "my-fan-box"
        });

        this._icon = new St.DrawingArea({
            width: Math.max(18, Math.floor(panelHeight * 0.58)),
            height: Math.max(20, panelHeight - 6)
        });
        this._icon.connect("repaint", this._drawFan.bind(this));

        this._textBox = new St.BoxLayout({
            vertical: true,
            style: "padding-left: 3px;"
        });

        this._speedLabel = new St.Label({
            text: "--"
        });

        this._unitLabel = new St.Label({
            text: "RPM"
        });

        this._textBox.add_child(this._speedLabel);
        this._textBox.add_child(this._unitLabel);

        this._box.add_child(this._icon);
        this._box.add_child(this._textBox);
        this.actor.add_child(this._box);

        this.set_applet_tooltip("Fan speed");

        this._update();
        this._startTimer();
    }


    _findFanPath() {
        let hwmon = Gio.File.new_for_path(HWMON_PATH);
        let hwmonEnumerator = null;

        try {
            hwmonEnumerator = hwmon.enumerate_children(
                "standard::name,standard::type",
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let hwmonInfo;
            while ((hwmonInfo = hwmonEnumerator.next_file(null)) !== null) {
                let device = hwmon.get_child(hwmonInfo.get_name());
                let fanEnumerator = device.enumerate_children(
                    "standard::name,standard::type",
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );

                let fanInfo;
                while ((fanInfo = fanEnumerator.next_file(null)) !== null) {
                    if (/^fan\d+_input$/.test(fanInfo.get_name())) {
                        fanEnumerator.close(null);
                        return device.get_child(fanInfo.get_name()).get_path();
                    }
                }

                fanEnumerator.close(null);
            }
        } catch (e) {
            global.logError("My Fan: Failed to find fan sensor: " + e);
        } finally {
            if (hwmonEnumerator !== null)
                hwmonEnumerator.close(null);
        }

        return null;
    }


    _readRpm() {
        if (this._fanPath === null)
            return null;

        try {
            let [, contents] = GLib.file_get_contents(this._fanPath);
            let rpm = parseInt(ByteArray.toString(contents).trim(), 10);

            return isFinite(rpm) && rpm >= 0 ? rpm : null;
        } catch (e) {
            return null;
        }
    }


    _update() {
        this._rpm = this._readRpm();
        this._speedLabel.set_text(
            this._rpm === null ? "??" : this._rpm.toString()
        );
        this.set_applet_tooltip(
            this._rpm === null ? "Fan speed unavailable" : "Fan speed"
        );
        this._icon.queue_repaint();
    }


    _drawFan(area) {
        let cr = area.get_context();
        let width = area.width;
        let height = area.height;
        let centerX = width / 2;
        let centerY = height / 2;
        let radius = Math.min(width, height) * 0.42;

        cr.setOperator(0);
        cr.paint();
        cr.setOperator(2);
        cr.setSourceRGBA(1, 1, 1, 1);

        for (let blade = 0; blade < 3; blade++) {
            cr.save();
            cr.translate(centerX, centerY);
            cr.rotate(blade * (Math.PI * 2 / 3));
            cr.translate(-centerX, -centerY);

            cr.moveTo(centerX - radius * 0.08, centerY - radius * 0.06);
            cr.curveTo(
                centerX + radius * 0.1,
                centerY - radius * 0.42,
                centerX + radius * 0.4,
                centerY - radius * 0.7,
                centerX + radius * 0.76,
                centerY - radius * 0.5
            );
            cr.curveTo(
                centerX + radius * 0.55,
                centerY - radius * 0.16,
                centerX + radius * 0.24,
                centerY + radius * 0.08,
                centerX - radius * 0.08,
                centerY + radius * 0.12
            );
            cr.closePath();
            cr.fill();
            cr.restore();
        }

        cr.arc(centerX, centerY, radius * 0.16, 0, Math.PI * 2);
        cr.fill();

        cr.$dispose();
    }


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


    on_applet_removed_from_panel() {
        if (this._updateTimer !== null) {
            GLib.source_remove(this._updateTimer);
            this._updateTimer = null;
        }
    }
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new FanApplet(metadata, orientation, panelHeight, instanceId);
}
