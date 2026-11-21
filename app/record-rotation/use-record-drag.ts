import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';

type Drag = { id: number; x: number; y: number; width: number; horizontal: boolean };

export function useRecordDrag(move: (direction: number) => void) {
  const gesture = useRef<Drag | null>(null);
  const discardClick = useRef(false);
  const [holding, setHolding] = useState(false);

  function reset(stage: HTMLDivElement) {
    const drag = gesture.current;
    gesture.current = null;
    setHolding(false);
    delete stage.dataset.dragging;
    stage.style.removeProperty('--drag-offset');
    if (drag && stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id);
  }

  return {
    holding,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!event.isPrimary || event.button !== 0 || gesture.current) return;
        discardClick.current = false;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
          width: event.currentTarget.clientWidth, horizontal: false };
        setHolding(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const drag = gesture.current;
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.horizontal) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) {
            reset(event.currentTarget);
            return;
          }
          drag.horizontal = true;
          discardClick.current = true;
          event.currentTarget.setPointerCapture(drag.id);
          event.currentTarget.dataset.dragging = 'true';
        }
        event.currentTarget.style.setProperty('--drag-offset', Math.max(-32, Math.min(32, dx * 0.24)) + 'px');
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const drag = gesture.current;
        if (!drag || event.pointerId !== drag.id) return;
        const distance = event.clientX - drag.x;
        if (drag.horizontal && Math.abs(distance) >= Math.max(28, Math.min(60, drag.width * 0.085))) {
          move(distance < 0 ? 1 : -1);
        }
        reset(event.currentTarget);
      },
      onPointerCancel(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.id === event.pointerId) reset(event.currentTarget);
      },
      onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
        // Transfer from a touch button to the stage emits a bubbling lost-capture.
        if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) reset(event.currentTarget);
      },
      onPointerLeave(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.id === event.pointerId && !gesture.current.horizontal) reset(event.currentTarget);
      },
      onClickCapture(event: MouseEvent<HTMLDivElement>) {
        if (!discardClick.current || event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
        discardClick.current = false;
      },
    },
  };
}
