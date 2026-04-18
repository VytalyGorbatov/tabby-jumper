# Tabby Jumper Plugin

A navigation plugin for [Tabby](https://tabby.sh/) that allows jumping between command lines and custom bookmarks.

## Features

- **Command Navigation**: Automatically records the line where you press `Enter` and allows jumping between them.
- **Bookmarks**: Manually mark lines to jump back to them later.
- **Split-Pane Support**: Works correctly with active panes in split-tab layouts.

## Default Hotkeys

You should configure these in Tabby's **Settings > Hotkeys**:

- `Jumper: Jump to previous command`: Jump up to the previous `Enter` location.
- `Jumper: Jump to next command`: Jump down to the next recorded command.
- `Jumper: Add bookmark`: Toggle a persistent bookmark on the current cursor line (or selection start).
- `Jumper: Jump to previous bookmark`: Navigate up through manual bookmarks.
- `Jumper: Jump to next bookmark`: Navigate down through manual bookmarks.

## Installation

1. Clone this repository into your Tabby plugins folder.
2. Run `npm install`.
3. Run `npm run build`.
4. Restart Tabby.

## Technical Details

- Bookmarks won't be saved between Tabby launches.
