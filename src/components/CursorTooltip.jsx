import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function CursorTooltip({ children, className = '', onlyWhenOverflowing = false, text }) {
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);

  const updatePosition = (event) => {
    if (!text) return;
    const overflowTarget = triggerRef.current?.querySelector('[data-cursor-tooltip-trigger]') ?? triggerRef.current;
    if (onlyWhenOverflowing && (!overflowTarget || overflowTarget.scrollWidth <= overflowTarget.clientWidth)) {
      setPosition(null);
      return;
    }
    setPosition({
      x: Math.min(event.clientX + 16, window.innerWidth - 356),
      y: Math.min(event.clientY + 16, window.innerHeight - 120),
    });
  };

  return (
    <>
      <span ref={triggerRef} className={className} onPointerEnter={updatePosition} onPointerMove={updatePosition} onPointerLeave={() => setPosition(null)}>
        {children}
      </span>
      {position && createPortal(
        <span className="cursor-hover-tooltip" style={{ left: position.x, top: position.y }}>{text}</span>,
        document.body,
      )}
    </>
  );
}
