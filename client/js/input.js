// Keyboard + mouse input. Exposes held movement keys, the mouse position and
// an "action" button (Space or left mouse) used for cast / hook / reel.

const MOVE_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export class Input {
  constructor(canvas, { onMoveChange, onActionDown, onActionUp, onCancel }) {
    this.move = { up: false, down: false, left: false, right: false };
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.actionHeld = false;

    const setAction = (down) => {
      if (down === this.actionHeld) return;
      this.actionHeld = down;
      (down ? onActionDown : onActionUp)();
    };

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const dir = MOVE_KEYS[e.code];
      if (dir) {
        e.preventDefault();
        if (!this.move[dir]) { this.move[dir] = true; onMoveChange({ ...this.move }); }
      } else if (e.code === 'Space') {
        e.preventDefault();
        setAction(true);
      } else if (e.code === 'Escape' || e.code === 'KeyE') {
        onCancel();
      }
    });
    window.addEventListener('keyup', (e) => {
      const dir = MOVE_KEYS[e.code];
      if (dir && this.move[dir]) { this.move[dir] = false; onMoveChange({ ...this.move }); }
      else if (e.code === 'Space') setAction(false);
    });
    // Release everything if the window loses focus so nobody walks forever.
    window.addEventListener('blur', () => {
      if (Object.values(this.move).some(Boolean)) {
        this.move = { up: false, down: false, left: false, right: false };
        onMoveChange({ ...this.move });
      }
      setAction(false);
    });

    canvas.addEventListener('mousemove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      setAction(true);
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) setAction(false); });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); onCancel(); });
  }
}
