const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Settings = imports.ui.settings;

const MEMINFO_PATH = "/proc/meminfo";
const UPDATE_INTERVAL = 5;


class RamApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._updateTimer = null;
        this._memory = null;

        this._box = new St.BoxLayout({
            vertical: false,
            style_class: "my-ram-box"
        });

        this._icon = new St.DrawingArea({
            width: Math.max(20, Math.floor(panelHeight * 0.58)),
            height: Math.max(20, panelHeight - 6)
        });
        this._icon.connect("repaint", this._drawRam.bind(this));

        this._textBox = new St.BoxLayout({
            vertical: true,
            style: "padding-left: 3px;"
        });

        this._usageLabel = new St.Label({
            text: "?? / ?? GB"
        });

        this._percentageLabel = new St.Label({
            text: "??%"
        });

        this._textBox.add_child(this._percentageLabel);
        this._textBox.add_child(this._usageLabel);

        this._box.add_child(this._icon);
        this._box.add_child(this._textBox);
        this.actor.add_child(this._box);

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

        this.set_applet_tooltip("Memory usage");

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

        this._usageLabel.get_clutter_text().set_line_alignment(alignment_pango);
        this._percentageLabel.get_clutter_text().set_line_alignment(alignment_pango);

        this._usageLabel.get_clutter_text().set_x_align(alignment_clutter);
        this._percentageLabel.get_clutter_text().set_x_align(alignment_clutter);
    }


    _updateIconVisibility() {
        this._icon.visible = this._showIcon;
    }


    _readMemory() {
        try {
            let [, contents] = GLib.file_get_contents(MEMINFO_PATH);
            let lines = ByteArray.toString(contents).split("\n");
            let values = {};

            for (let line of lines) {
                let match = line.match(/^(MemTotal|MemAvailable):\s+(\d+)/);
                if (match !== null)
                    values[match[1]] = parseInt(match[2], 10);
            }

            if (!isFinite(values.MemTotal) || !isFinite(values.MemAvailable))
                return null;

            let total = values.MemTotal;
            let available = Math.min(values.MemAvailable, total);
            let used = total - available;

            return {
                used: used,
                total: total,
                percentage: Math.round(used / total * 100)
            };
        } catch (e) {
            return null;
        }
    }


    _formatGb(kibibytes) {
        return (kibibytes * 1024 / 1000000000).toFixed(1);
    }


    _update() {
        this._memory = this._readMemory();

        if (this._memory === null) {
            this._usageLabel.set_text("??/?? GB");
            this._percentageLabel.set_text("??%");
            this.set_applet_tooltip("Memory usage unavailable");
        } else {
            this._usageLabel.set_text(
                this._formatGb(this._memory.used) +
                "/" +
                this._formatGb(this._memory.total) +
                " GB"
            );
            this._percentageLabel.set_text(
                this._memory.percentage.toString() + "%"
            );
            this.set_applet_tooltip("Memory usage");
        }

        if (this._showIcon)
            this._icon.queue_repaint();

        this._applyAlignment();
    }


    _drawRam(area) {
        let cr = area.get_context();
        let width = area.width;
        let height = area.height;
        let boardX = width * 0.1;
        let boardY = height * 0.13;
        let boardWidth = width * 0.6;
        let boardHeight = height * 0.74;
        let chipWidth = boardWidth * 0.42;
        let chipHeight = boardHeight * 0.12;

        cr.setOperator(0);
        cr.paint();
        cr.setOperator(2);
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.setLineWidth(Math.max(1.5, height * 0.06));

        cr.rectangle(boardX, boardY, boardWidth, boardHeight);
        cr.stroke();

        for (let chip = 0; chip < 4; chip++) {
            let chipX = boardX + (boardWidth - chipWidth) / 2;
            let chipY = boardY + boardHeight * 0.08 + chip * boardHeight * 0.22;
            cr.rectangle(chipX, chipY, chipWidth, chipHeight);
            cr.fill();
        }

        for (let contact = 0; contact < 8; contact++) {
            let contactY = boardY + boardHeight * 0.04 + contact * boardHeight * 0.11;
            cr.rectangle(boardX + boardWidth, contactY, width * 0.18, boardHeight * 0.055);
            cr.fill();
        }

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
    return new RamApplet(metadata, orientation, panelHeight, instanceId);
}
