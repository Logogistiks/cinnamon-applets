const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

const Base = imports.applets["clock@logogistiks"].shared.appletBase;

const UPDATE_INTERVAL = 1;


class ClockApplet extends Base.TwoLineApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(metadata, orientation, panelHeight, instanceId);

        this._topLabel.set_text("--:--:--");
        this._botLabel.set_text("--, --.--.----");

        this._topFormat = "%H:%M:%S";
        this._botFormat = "%a, %d.%m.%Y";
        this._labelAlignment = "center";

        this._settings = new Settings.AppletSettings(
            this,
            metadata.uuid,
            instanceId
        );
        this._settings.bind(
            "top-format",
            "_topFormat",
            this._update
        );
        this._settings.bind(
            "bot-format",
            "_botFormat",
            this._update
        );
        this._settings.bind(
            "label-alignment",
            "_labelAlignment",
            this._applyAlignment
        );

        this._update();
        this._startTimer(UPDATE_INTERVAL);
    }


    _update() {
        let now = GLib.DateTime.new_now_local();

        try {
            this._topLabel.set_text(now.format(this._topFormat));
            this._botLabel.set_text(now.format(this._botFormat));
        } catch (e) {
            global.logError("Clock: Invalid date or time format: " + e);
            this._topLabel.set_text(now.format("%H:%M:%S"));
            this._botLabel.set_text(now.format("%a, %d.%m.%Y"));
        }

        this._applyAlignment();
    }


    on_settings_infobutton() {
        let url = "https://docs.python.org/3.6/library/datetime.html#strftime-and-strptime-behavior";
        Gio.AppInfo.launch_default_for_uri(url, null);
    }
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new ClockApplet(metadata, orientation, panelHeight, instanceId);
}
