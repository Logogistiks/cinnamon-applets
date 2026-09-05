const Applet = imports.ui.applet;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const Settings = imports.ui.settings;

const UPDATE_INTERVAL = 1;


class ClockApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._updateTimer = null;
        this._timeFormat = "%H:%M:%S";
        this._dateFormat = "%a, %d.%m.%Y";
        this._textAlignment = "center";

        this._box = new St.BoxLayout({
            vertical: true,
            style_class: "my-clock-box"
        });

        this._timeLabel = new St.Label({
            text: "--:--:--",
            x_expand: true
        });

        this._dateLabel = new St.Label({
            text: "--, --.--.----",
            x_expand: true
        });

        this._box.add_child(this._timeLabel);
        this._box.add_child(this._dateLabel);
        this.actor.add_child(this._box);

        this._settings = new Settings.AppletSettings(
            this,
            metadata.uuid,
            instanceId
        );
        this._settings.bind(
            "time-format",
            "_timeFormat",
            this._onSettingsChanged
        );
        this._settings.bind(
            "date-format",
            "_dateFormat",
            this._onSettingsChanged
        );
        this._settings.bind(
            "text-alignment",
            "_textAlignment",
            this._onSettingsChanged
        );

        this.set_applet_tooltip("Clock");

        this._update();
        this._applyAlignment();
        this._startTimer();
    }


    _applyAlignment() {
        let alignment = Pango.Alignment.CENTER;

        if (this._textAlignment === "left")
            alignment = Pango.Alignment.LEFT;
        if (this._textAlignment === "right")
            alignment = Pango.Alignment.RIGHT;

        this._timeLabel.get_clutter_text().set_line_alignment(alignment);
        this._dateLabel.get_clutter_text().set_line_alignment(alignment);
    }


    _onSettingsChanged() {
        this._applyAlignment();
        this._update();
    }


    _update() {
        let now = GLib.DateTime.new_now_local();

        try {
            this._timeLabel.set_text(now.format(this._timeFormat));
            this._dateLabel.set_text(now.format(this._dateFormat));
        } catch (e) {
            global.logError("Clock: Invalid date or time format: " + e);
            this._timeLabel.set_text(now.format("%H:%M:%S"));
            this._dateLabel.set_text(now.format("%a, %d.%m.%Y"));
        }
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
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new ClockApplet(metadata, orientation, panelHeight, instanceId);
}
