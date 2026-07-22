# Wordle

A custom Wordle game hosted on GitHub Pages. Mobile-friendly with an admin panel for daily word management.

## Features
- 🎮 Classic Wordle gameplay (5 letters, 6 guesses)
- 📱 Mobile-first responsive design
- 🔐 Admin panel to set the daily word
- 📅 Auto-falls back to last word if admin doesn't update
- 📱 QR code generator for sharing the site link
- 🎯 Touch keyboard + physical keyboard support
- 🌙 Dark mode

## Play
Visit the GitHub Pages URL to play.

## Admin
Visit `/admin.html` and enter the admin password to:
- Set the daily Wordle word
- Generate a QR code for the site link

The daily word is stored in `words.json` in the repo. If no word is set for today, the last available word is used.
