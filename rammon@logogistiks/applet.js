const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Settings = imports.ui.settings;

const Base = imports.applets["rammon@logogistiks"].shared.appletBase;

const MEMINFO_PATH = "/proc/meminfo";
const UPDATE_INTERVAL = 5;


class RamApplet extends Base.IconTwoLineApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(metadata, orientation, panelHeight, instanceId, {
            widthFactor: 0.58,
            minWidth: 20,
            minHeight: 20,
            heightPadding: 6
        });

        this._textBox.set_style("padding-left: 3px;");
        this._topLabel.set_text("??%");
        this._botLabel.set_text("?? / ?? GB");

        this._memory = null;
        this._percentageLabel = this._topLabel;
        this._usageLabel = this._botLabel;

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
        this._startTimer(UPDATE_INTERVAL);
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

        this._queueIconRepaint();

        this._applyAlignment();
    }


    draw(area) {
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
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new RamApplet(metadata, orientation, panelHeight, instanceId);
}
