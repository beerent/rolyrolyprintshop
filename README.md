# Print Parade

A standalone, no-auth MVP for saving image files locally and printing them from a grid.

## Run

```bash
npm run dev
```

The app starts on `http://localhost:3030` by default.

Use another port with:

```bash
PORT=3031 npm run dev
```

## What It Does

- Saves image files in the browser with IndexedDB.
- Shows saved images in a responsive grid.
- Prints an image when the tile is clicked.
- Shows an ellipsis menu on hover/focus with Delete.
