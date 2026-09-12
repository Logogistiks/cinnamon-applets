const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Settings = imports.ui.settings;

const Base = imports.applets["cpumon@logogistiks"].shared.appletBase;

const PROC_STAT_PATH = "/proc/stat";
const HWMON_PATH = "/sys/class/hwmon";
const UPDATE_INTERVAL = 5;


class CpuApplet extends Base.IconTwoLineApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(metadata, orientation, panelHeight, instanceId, {
            widthFactor: 0.58,
            minWidth: 20,
            minHeight: 20,
            heightPadding: 6
        });

        this._textBox.set_style("padding-left: 3px;");
        this._topLabel.set_text("??%");
        this._botLabel.set_text("??°C");

        this._previousCpuTimes = null;
        this._temperaturePath = this._findTemperaturePath();
        this._usage = null;
        this._temperature = null;
        this._usageLabel = this._topLabel;
        this._temperatureLabel = this._botLabel;

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
            "temperature-unit",
            "_temperatureUnit",
            this._update
        );
        this._settings.bind(
            "label-alignment",
            "_labelAlignment",
            this._applyAlignment
        );

        this.set_applet_tooltip("CPU usage and temperature");

        this._update();
        this._startTimer(UPDATE_INTERVAL);
    }


    _readCpuTimes() {
        try {
            let [, contents] = GLib.file_get_contents(PROC_STAT_PATH);
            let lines = ByteArray.toString(contents).split("\n");
            let aggregate = null;
            let cores = [];

            lines.forEach(line => {
                let match = line.match(/^(cpu\d*)\s+(.*)$/);
                if (match === null)
                    return;

                let values = match[2].trim().split(/\s+/).map(value => parseInt(value, 10));
                if (values.length < 4 || values.some(value => !isFinite(value)))
                    return;

                let cpuTimes = {
                    total: values.reduce((sum, value) => sum + value, 0),
                    idle: values[3] + (values[4] || 0)
                };

                if (match[1] === "cpu")
                    aggregate = cpuTimes;
                else
                    cores.push(cpuTimes);
            });

            if (aggregate === null || cores.length === 0)
                return null;

            return {
                aggregate: aggregate,
                cores: cores
            };
        } catch (e) {
            return null;
        }
    }


    _readCpuUsage() {
        let current = this._readCpuTimes();
        if (current === null) {
            this._previousCpuTimes = null;
            return null;
        }

        let usage = null;
        if (this._previousCpuTimes !== null) {
            let totalDelta = current.aggregate.total - this._previousCpuTimes.aggregate.total;
            let idleDelta = current.aggregate.idle - this._previousCpuTimes.aggregate.idle;
            if (totalDelta > 0)
                usage = Math.round((totalDelta - idleDelta) / totalDelta * 100);
        }

        let coreUsages = [];
        if (this._previousCpuTimes !== null) {
            current.cores.forEach((core, index) => {
                let previousCore = this._previousCpuTimes.cores[index];
                if (previousCore === undefined) {
                    coreUsages.push(null);
                    return;
                }

                let totalDelta = core.total - previousCore.total;
                let idleDelta = core.idle - previousCore.idle;
                coreUsages.push(
                    totalDelta > 0 ?
                        Math.max(0, Math.min(100, Math.round((totalDelta - idleDelta) / totalDelta * 100))) :
                        null
                );
            });
        }

        this._previousCpuTimes = current;
        return {
            aggregate: usage === null ? null : Math.max(0, Math.min(100, usage)),
            cores: coreUsages
        };
    }


    _findTemperaturePath() {
        let hwmon = Gio.File.new_for_path(HWMON_PATH);
        let hwmonEnumerator = null;
        let fallbackPath = null;

        try {
            hwmonEnumerator = hwmon.enumerate_children(
                "standard::name,standard::type",
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let hwmonInfo;
            while ((hwmonInfo = hwmonEnumerator.next_file(null)) !== null) {
                let device = hwmon.get_child(hwmonInfo.get_name());
                let deviceNamePath = device.get_child("name").get_path();
                let deviceName = this._readText(deviceNamePath);
                let temperatureEnumerator = device.enumerate_children(
                    "standard::name,standard::type",
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );

                let temperatureInfo;
                while ((temperatureInfo = temperatureEnumerator.next_file(null)) !== null) {
                    if (!/^temp\d+_input$/.test(temperatureInfo.get_name()))
                        continue;

                    let path = device.get_child(temperatureInfo.get_name()).get_path();
                    if (fallbackPath === null)
                        fallbackPath = path;
                    if (/(coretemp|k10temp|cpu|package)/i.test(deviceName)) {
                        temperatureEnumerator.close(null);
                        return path;
                    }
                }

                temperatureEnumerator.close(null);
            }
        } catch (e) {
            global.logError("CPU Monitor: Failed to find temperature sensor: " + e);
        } finally {
            if (hwmonEnumerator !== null)
                hwmonEnumerator.close(null);
        }

        return fallbackPath;
    }


    _readText(path) {
        try {
            let [, contents] = GLib.file_get_contents(path);
            return ByteArray.toString(contents).trim();
        } catch (e) {
            return "";
        }
    }


    _readTemperature() {
        if (this._temperaturePath === null)
            return null;

        let millidegrees = parseInt(this._readText(this._temperaturePath), 10);
        return isFinite(millidegrees) ? millidegrees / 1000 : null;
    }


    _formatTemperature(celsius) {
        if (this._temperatureUnit === "fahrenheit")
            return (celsius * 9 / 5 + 32).toFixed(1) + "°F";
        if (this._temperatureUnit === "kelvin")
            return (celsius + 273.15).toFixed(1) + "K";
        return celsius.toFixed(1) + "°C";
    }


    _update() {
        let usage = this._readCpuUsage();
        this._usage = usage.aggregate;
        this._temperature = this._readTemperature();

        this._usageLabel.set_text(
            this._usage === null ? "??%" : this._usage.toString() + "%"
        );
        this._temperatureLabel.set_text(
            this._temperature === null ? "??°" : this._formatTemperature(this._temperature)
        );
        let tooltipLines = [];
        if (usage.cores.length > 0) {
            usage.cores.forEach((coreUsage, index) => {
                tooltipLines.push(
                    "C" + (index + 1) + ": " +
                    (coreUsage === null ? "??" : coreUsage) + "%"
                );
            });
        }

        this.set_applet_tooltip(
            tooltipLines.length === 0 ?
                "CPU information unavailable" : tooltipLines.join("\n")
        );
        this._queueIconRepaint();

        this._applyAlignment();
    }


    draw(area) {
        let cr = area.get_context();
        let width = area.width;
        let height = area.height;
        let centerX = width * 0.45;
        let centerY = height / 2;
        let size = Math.min(width, height) / 2;
        let pinLength = size * 0.4;
        let pinWidth = Math.max(1.5, size * 0.1);

        cr.setOperator(0);
        cr.paint();
        cr.setOperator(2);
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.setLineWidth(Math.max(1.5, height * 0.06));

        cr.rectangle(centerX - size / 2, centerY - size / 2, size, size);
        cr.stroke();

        for (let pin = 0; pin < 4; pin++) {
            let offset = (pin - 1.5) * size * 0.26;
            cr.rectangle(centerX + offset - pinWidth / 2, centerY - size / 2 - pinLength, pinWidth, pinLength);
            cr.fill();
            cr.rectangle(centerX + offset - pinWidth / 2, centerY + size / 2, pinWidth, pinLength);
            cr.fill();
            cr.rectangle(centerX - size / 2 - pinLength, centerY + offset - pinWidth / 2, pinLength, pinWidth);
            cr.fill();
            cr.rectangle(centerX + size / 2, centerY + offset - pinWidth / 2, pinLength, pinWidth);
            cr.fill();
        }

        cr.rectangle(centerX - size * 0.23, centerY - size * 0.23, size * 0.46, size * 0.46);
        cr.fill();

        cr.$dispose();
    }
}


function main(metadata, orientation, panelHeight, instanceId) {
    return new CpuApplet(metadata, orientation, panelHeight, instanceId);
}
