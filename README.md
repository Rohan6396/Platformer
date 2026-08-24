# Skybound Circuit DX

Skybound Circuit DX is an unofficial Star Wars-inspired fan platformer for one or two players that runs directly in the browser. Race through six themed stages, break Imperial blockades, master the light or dark side of the Force, defeat a different guardian in each world, and unlock new pilots.

This is an unofficial, non-commercial fan project. It is not affiliated with or endorsed by Lucasfilm or Disney.

## What is included

- Six distinct worlds with longer par times, two mandatory Imperial combat blockades per stage, hazards, secrets, weather, and bosses
- Solo play and local co-op, including partner rescue bubbles and a fair finish countdown
- Always-available vibroblade combat plus blaster, carbonite pulse, lightsaber, Force lightning, Force push, and deflector shield abilities
- Coyote time, jump buffering, variable jump height, hazard-safe checkpoints, hit feedback, and camera smoothing
- Persistent stage unlocks, pilots, shards, scores, times, and grades using local storage
- Explorer, Arcade, and Overdrive difficulties with scaling enemy health, faster attacks, boss volleys, and ground shockwaves
- Keyboard remapping, gamepad support, touch controls, fullscreen, sound controls, reduced motion, and high contrast
- Responsive presentation for desktop, tablet, and phone screens
- Existing CC0 chiptune soundtrack plus synthesized arcade and Force-power sound effects

## Audio credits

The soundtrack is the alternate version of [“Overworld Theme” by Louswan](https://opengameart.org/content/overworld-theme-0), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required by CC0, but the source and file checksum are retained in `assets/audio/README.md` for provenance.

## Play

Open the [live GitHub Pages build](https://rohan6396.github.io/Platformer/) or serve the repository locally:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move | A / D | Left / Right |
| Jump | W | Up |
| Crouch | S | Down |
| Attack | Space | / |
| Pause | P or Escape | P or Escape |

Controls can be remapped from Settings. On touch devices, an on-screen controller appears automatically. Standard gamepads are detected during play.

## Grades and progression

Finish a stage to unlock the next world. A high grade rewards fast clears, all three shards, and no damage. Replays preserve the best score, fastest time, best grade, and most shards collected for each stage.

## Development

The game deliberately uses browser-native JavaScript and p5.js without a build step. Run all checks with Node 22 or newer:

```sh
npm run verify
```

The GitHub Actions workflow runs the same syntax and feature checks for every pull request and push to `main`.
