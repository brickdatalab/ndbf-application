import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "./ui/Button";

type Props = {
  value: string;
  onChange: (dataUrl: string) => void;
  onClear: () => void;
};

export function SignaturePad({ value, onChange, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const ratio = window.devicePixelRatio || 1;
      const parentW = canvas.parentElement?.clientWidth ?? 600;
      const w = parentW;
      const h = 180;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#002140"; // brand navy
    };
    setup();
    const ro = new ResizeObserver(setup);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  const getPoint = (e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    lastPt.current = getPoint(e);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.current!.x, lastPt.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt.current = p;
    if (!hasInk) setHasInk(true);
  };

  const handleUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
    setHasInk(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative bg-white border-2 border-dashed border-divider-muted hover:border-brand-blue/50 rounded-xl overflow-hidden transition-colors">
        <canvas
          ref={canvasRef}
          className="signature-canvas block w-full"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-ink-muted/60 font-body text-sm">
            Sign here with your mouse, trackpad, or finger
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          <Eraser className="h-3.5 w-3.5" />
          Clear signature
        </Button>
      </div>
    </div>
  );
}
