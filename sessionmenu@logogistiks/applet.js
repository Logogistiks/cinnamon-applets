const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Settings = imports.ui.settings;

class SessionMenu extends Applet.IconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);

        const keys = ["panel-icon", "label-position", "icon-size", "horizontal-space", "actions"];
        for (let key of keys) {
            let camelProp = "_" + key.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
            this._settings.bind(key, camelProp, () => this._onSettingsChanged(key));
        }

        this.set_applet_icon_name(this._panelIcon || metadata.icon);
        //this.set_applet_tooltip(metadata.name);

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menu = new PopupMenu.PopupMenu(this.actor, orientation, 0.0);
        this._menuManager.addMenu(this._menu);
        Main.uiGroup.add_actor(this._menu.actor);
        this._menu.actor.hide();
        this._menu.actor.set_style("padding: 4px 0px; margin: 0px;");

        this._actionLabel = new St.Label({
            text: "Session Menu",
            style_class: "popup-menu-item",
            style: "padding: 0px 12px; margin: 0px; font-weight: bold; text-align: center;",
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });

        let clutterText = this._actionLabel.get_clutter_text();
        clutterText.set_line_wrap(true);
        clutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        clutterText.set_line_alignment(Pango.Alignment.CENTER);

        this._labelRow = new St.Bin({
            height: 40,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE,
            x_fill: true,
            style: "padding: 0px; margin: 0px;",
            child: this._actionLabel
        });

        this._actionButtons = [];
        this._rebuildMenu();
    }

    _onSettingsChanged(key) {
        if (key === "panel-icon") {
            this.set_applet_icon_name(this._panelIcon);
        } else {
            this._rebuildMenu();
        }
    }

    restoreActions() {
        let defaults = this._settings.getDefaultValue("actions");
        this._settings.setValue("actions", JSON.parse(JSON.stringify(defaults)));
    }

    _clearMenu() {
        for (let button of this._actionButtons) {
            this._menu.box.remove_child(button);
            button.destroy();
        }
        this._actionButtons = [];

        if (this._menu.box.contains(this._labelRow)) {
            this._menu.box.remove_child(this._labelRow);
        }
        
        this._menu.removeAll();
    }

    _rebuildMenu() {
        const menuWidth = this._iconSize + (this._horizontalSpace * 2);

        this._menu.actor.set_width(menuWidth);
        this._actionLabel.set_width(menuWidth);
        this._labelRow.set_width(menuWidth);

        this._clearMenu();

        if (this._labelPosition === "above") {
            this._menu.box.add_child(this._labelRow);
            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        for (let action of this._actions || []) {
            this._addAction(action, menuWidth);
        }
        if (this._labelPosition === "below") {
            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._menu.box.add_child(this._labelRow);
        }
    }

    _addAction(action, width) {
        if (!action?.name || !action?.icon) return;

        const icon = new St.Icon({
            icon_name: action.icon,
            icon_type: St.IconType.FULLCOLOR,
            style_class: "popup-menu-icon",
            icon_size: this._iconSize
        });

        const leftSpacer = new St.Widget({ width: this._horizontalSpace });
        const rightSpacer = new St.Widget({ width: this._horizontalSpace });

        const iconRow = new St.BoxLayout({
            vertical: false,
            width: width,
            height: 48,
            style: "padding: 0px; margin: 0px;",
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        iconRow.add_child(leftSpacer);
        iconRow.add_child(icon);
        iconRow.add_child(rightSpacer);

        const button = new St.Button({
            style_class: "popup-menu-item",
            style: "padding: 0px; margin-bottom: 4px;",
            width: width,
            height: 48,
            child: iconRow
        });

        button.connect("enter-event", () => {
            button.add_style_pseudo_class("hover");
            button.set_style("padding: 0px; margin-bottom: 4px; background-color: rgba(255, 255, 255, 0.14);");
            this._actionLabel.set_text(action.name);
        });

        button.connect("leave-event", () => {
            button.remove_style_pseudo_class("hover");
            button.set_style("padding: 0px; margin-bottom: 4px;");
            this._actionLabel.set_text("Session Menu");
        });

        button.connect("clicked", () => {
            if (action.command) {
                Util.spawnCommandLine(action.command);
            }
            this._menu.close();
        });

        this._menu.box.add_child(button);
        this._actionButtons.push(button);
    }

    on_applet_clicked() {
        this._menu.toggle();
    }

    on_applet_removed_from_panel() {
        this._clearMenu();
        this._menuManager.removeMenu(this._menu);
        this._menu.destroy();
        this._settings.finalize();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new SessionMenu(metadata, orientation, panelHeight, instanceId);
}