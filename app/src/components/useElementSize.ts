import { useEffect, useState } from "react";

// 固定サイズのスライドを親の大きさに合わせるため、要素の実寸を測る
export const useElementSize = <T extends HTMLElement>() => {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref: setElement, ...size };
};
