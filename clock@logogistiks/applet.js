const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Pango = imports.gi.Pango;
const Settings = imports.ui.settings;

const UPDATE_INTERVAL = 1;


class ClockApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._updateTimer = null;
        this._topFormat = "%H:%M:%S";
        this._botFormat = "%a, %d.%m.%Y";
        this._labelAlignment = "center";

        this._box = new St.BoxLayout({
            vertical: true,
            style_class: "my-clock-box",
        });

        this._topLabel = new St.Label({
            text: "--:--:--",
        });

        this._botLabel = new St.Label({
            text: "--, --.--.----",
        });

        this._box.add_child(this._topLabel);
        this._box.add_child(this._botLabel);
        this.actor.add_child(this._box);

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
        this._startTimer();
    }


    _applyAlignment() {
        let alignment_pango, alignment_clutter;

        switch (this._labelAlignment) {
            case "left":
                alignment_pango = Pango.Alignment.LEFT;
                alignment_clutter = Clutter.ActorAlign.START;
                break;
            case "right":
                alignment_pango = Pango.Alignment.RIGHT;
                alignment_clutter = Clutter.ActorAlign.END;
                break;
            default:
                alignment_pango = Pango.Alignment.CENTER;
                alignment_clutter = Clutter.ActorAlign.CENTER;
                break;
        }

        this._topLabel.get_clutter_text().set_line_alignment(alignment_pango);
        this._botLabel.get_clutter_text().set_line_alignment(alignment_pango);

        this._topLabel.get_clutter_text().set_x_align(alignment_clutter);
        this._botLabel.get_clutter_text().set_x_align(alignment_clutter);
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

        this._settings.finalize();
    }


    on_settings_infobutton() {
        let url = "https://docs.python.org/3.6/library/datetime.html#strftime-and-strptime-behavior";
        Gio.AppInfo.launch_default_for_uri(url, null);
    }
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new ClockApplet(metadata, orientation, panelHeight, instanceId);
}
