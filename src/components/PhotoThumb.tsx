import { useEffect, useState } from 'react';

interface Props {
  blob: Blob;
  className?: string;
  alt?: string;
}

export default function PhotoThumb({ blob, className, alt }: Props) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  if (!src) return <div className={`bg-glow-100 ${className ?? ''}`} />;
  return <img src={src} alt={alt ?? ''} className={className} />;
}
