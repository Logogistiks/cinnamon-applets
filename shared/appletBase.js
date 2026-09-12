const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const GLib = imports.gi.GLib;

const DEFAULT_ICON_WIDTH_FACTOR = 0.58;
const DEFAULT_ICON_MIN_WIDTH = 20;
const DEFAULT_ICON_MIN_HEIGHT = 20;
const DEFAULT_ICON_HEIGHT_PADDING = 6;


var TwoLineApplet = class TwoLineApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._updateTimer = null;

        this._box = new St.BoxLayout({
            vertical: true
        });
        this._textBox = this._box;
        this._topLabel = new St.Label({
            text: ""
        });
        this._botLabel = new St.Label({
            text: ""
        });

        this._box.add_child(this._topLabel);
        this._box.add_child(this._botLabel);
        this.actor.add_child(this._box);
    }


    _applyAlignment() {
        let alignmentPango, alignmentClutter;

        switch (this._labelAlignment) {
            case "left":
                alignmentPango = Pango.Alignment.LEFT;
                alignmentClutter = Clutter.ActorAlign.START;
                break;
            case "right":
                alignmentPango = Pango.Alignment.RIGHT;
                alignmentClutter = Clutter.ActorAlign.END;
                break;
            default:
                alignmentPango = Pango.Alignment.CENTER;
                alignmentClutter = Clutter.ActorAlign.CENTER;
                break;
        }

        for (let label of [this._topLabel, this._botLabel]) {
            label.get_clutter_text().set_line_alignment(alignmentPango);
            label.get_clutter_text().set_x_align(alignmentClutter);
        }
    }


    _startTimer(interval) {
        this._updateTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            interval,
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

        if (this._settings)
            this._settings.finalize();
    }
}


var IconTwoLineApplet = class IconTwoLineApplet extends TwoLineApplet {
    constructor(metadata, orientation, panelHeight, instanceId, iconOptions) {
        super(metadata, orientation, panelHeight, instanceId);

        iconOptions = iconOptions || {};
        this.actor.remove_child(this._box);

        this._box = new St.BoxLayout({
            vertical: false
        });
        this._box.add_child(this._createIcon(panelHeight, iconOptions));
        this._box.add_child(this._textBox);
        this.actor.add_child(this._box);
    }


    _createIcon(panelHeight, iconOptions) {
        let icon = new St.DrawingArea({
            width: Math.max(
                iconOptions.minWidth || DEFAULT_ICON_MIN_WIDTH,
                Math.floor(panelHeight * (
                    iconOptions.widthFactor || DEFAULT_ICON_WIDTH_FACTOR
                ))
            ),
            height: Math.max(
                iconOptions.minHeight || DEFAULT_ICON_MIN_HEIGHT,
                panelHeight - (
                    iconOptions.heightPadding || DEFAULT_ICON_HEIGHT_PADDING
                )
            )
        });

        icon.connect("repaint", this.draw.bind(this));
        this._icon = icon;
        return icon;
    }


    _updateIconVisibility() {
        this._icon.visible = this._showIcon;
    }


    _queueIconRepaint() {
        if (this._showIcon)
            this._icon.queue_repaint();
    }


    draw(area) {
        // Subclasses draw their icon here.
    }
}
