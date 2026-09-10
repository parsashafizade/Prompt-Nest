import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface AnchoredContextMenuProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  onClose: () => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function AnchoredContextMenu({ anchorRef, children, onClose }: AnchoredContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const anchorBounds = anchor.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    const edge = 8;
    const below = anchorBounds.bottom + edge;
    const top = below + menuBounds.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, anchorBounds.top - menuBounds.height - edge);
    const alignedLeft = document.documentElement.dir === "rtl"
      ? anchorBounds.left
      : anchorBounds.right - menuBounds.width;
    const left = Math.min(
      window.innerWidth - menuBounds.width - edge,
      Math.max(edge, alignedLeft),
    );
    setPosition({ top, left });
  }, [anchorRef]);

  useLayoutEffect(updatePosition, [updatePosition]);

  useEffect(() => {
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      className="context-menu context-menu-portal"
      onClick={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
