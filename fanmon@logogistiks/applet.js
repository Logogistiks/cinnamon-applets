const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Settings = imports.ui.settings;

const Base = imports.applets["fanmon@logogistiks"].shared.appletBase;

const HWMON_PATH = "/sys/class/hwmon";
const UPDATE_INTERVAL = 5;


class FanApplet extends Base.IconTwoLineApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(metadata, orientation, panelHeight, instanceId, {
            widthFactor: 0.58,
            minWidth: 18,
            minHeight: 20,
            heightPadding: 6
        });

        this._textBox.set_style("padding-left: 0px;");
        this._topLabel.set_text("??");
        this._botLabel.set_text("RPM");

        this._fanPath = this._findFanPath();
        this._rpm = null;
        this._speedLabel = this._topLabel;
        this._unitLabel = this._botLabel;

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
            "label-alignment",
            "_labelAlignment",
            this._applyAlignment
        );

        this.set_applet_tooltip(
            this._fanPath === null ? "Fan path unavailable" : this._fanPath
        );

        this._update();
        this._startTimer(UPDATE_INTERVAL);
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
            this._fanPath === null ? "Fan path unavailable" : this._fanPath
        );
        this._queueIconRepaint();

        this._applyAlignment();
    }


    draw(area) {
        let cr = area.get_context();
        let width = area.width;
        let height = area.height;
        let centerX = width * 0.4;
        let centerY = height / 2;
        let radius = Math.min(width, height) / 2;

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
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new FanApplet(metadata, orientation, panelHeight, instanceId);
}
