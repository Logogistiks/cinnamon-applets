## Preview (may not be up to date)
From left to right:
[batterymon](/batterymon@logogistiks)
[rammon](/rammon@logogistiks)
[cpumon](/cpumon@logogistiks)
[fanmon](/fanmon@logogistiks)
[clock](/clock@logogistiks)
![](/images/screenshot.png)

The applets have *some* customization options:
![](/images/batterymon_settings.png)

> To customize an applet, right click it in the panel and select "Configure..."

## Installation
The directory in which cinnamon looks for applets is `~/.local/share/cinnamon/applets/`. \
There are different ways of adding (my) applets, which are described below.

### 1. Automatic <sub>[all, symlinks]</sub>
This approach installs **all** of my applets in this repository (all folders ending in "@logogistiks") via [symlinking](https://en.wikipedia.org/wiki/Symbolic_link) to the cloned repo directory.

> Note that there's a difference between "installing" applets to your system and actually adding them to your panel. So even if you only want to use some of my applets, you can still let them all install automatically and just add the ones you want to the panel.

If not done already, clone the repo at a stable location (for example `~/Documents/GitHub/`) by running:

```bash
cd ~/Documents/GitHub/
git clone https://github.com/Logogistiks/cinnamon-applets.git
cd cinnamon-applets/
```

In this repo is a shell script `sync.sh` which symlinks the `shared/` directory into every applet-subdirectory, and then symlinks each of those into `~/.local/share/cinnamon/applets/`. Run it with:

```bash
bash sync.sh
```

Since the applets are symlinked instead of copied, updating them is as simple as doing `git pull` in the repo. If I have created a new applet, you need to run `sync.sh` again.

### 2. Manual <sub>[single, symlink]</sub>
To only install a single one of my applets via symlinking, run the same commands as `sync.sh`, but only for a single applet of your choice.

If not done already, clone the repo at a stable location (for example `~/Documents/GitHub/`) by running:

```bash
cd ~/Documents/GitHub/
git clone https://github.com/Logogistiks/cinnamon-applets.git
cd cinnamon-applets/
```

Example for `batterymon@logogistiks` (replace with the applet you want):

```bash
# 1. Make sure the applet dir exists
mkdir -p ~/.local/share/cinnamon/applets

# 2. Link the shared/ folder into the repo-applet
ln -sfn "$(pwd)/shared" "$(pwd)/batterymon@logogistiks/shared"

# 3. Link the repo-applet into the applet dir
ln -sfn "$(pwd)/batterymon@logogistiks" ~/.local/share/cinnamon/applets/batterymon@logogistiks
```

### 3. Manual <sub>[single, copy]</sub>
To only install a single one of my applets, but by creating a standalone copy instead of symlinking to a fixed repo directory, clone or simply download the repo, and do the following:

```bash
# 1. Make sure the applet dir exists
mkdir -p ~/.local/share/cinnamon/applets

# 2. Copy the shared/ folder into the repo-applet
cp -r shared batterymon@logogistiks/shared

# 3. Copy the repo-applet into the applet dir
cp -r batterymon@logogistiks ~/.local/share/cinnamon/applets/
```

This copies the applet and the shared code it needs into the applet dir, independent of the repo. You'll have to repeat this process to get updates.

### Add to panel
After installing the applet(s) with any of the above methods, restart cinnamon by pressing <kbd>Alt</kbd> + <kbd>F2</kbd>, typing <kbd>r</kbd> and pressing <kbd>Enter</kbd>.

Then add the applets to your panel: right-click a panel → **Applets** → find them in the **Manage** tab → click the plus symbol.

### Uninstalling
To remove all of my applets from your system, run:

```bash
bash remove.sh
```

Then restart cinnamon with the keybind above. \
After this, all of my applets should no longer appear in the applet menu.

## References
- <https://gjs-docs.gnome.org/>
- [settings-example@cinnamon.org](https://github.com/linuxmint/cinnamon/tree/master/files/usr/share/cinnamon/applets/settings-example%40cinnamon.org)
