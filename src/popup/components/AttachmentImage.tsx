import { useEffect, useState } from "react";
import { getAttachmentBlob } from "../../shared/db";

interface AttachmentImageProps {
  blobId: string;
  alt: string;
}

export function AttachmentImage({ blobId, alt }: AttachmentImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void getAttachmentBlob(blobId).then((stored) => {
      if (!active || !stored) return;
      objectUrl = URL.createObjectURL(stored.data);
      setUrl(objectUrl);
    }).catch(() => {
      if (active) setUrl(null);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);
  return url ? <img alt={alt} className="note-attachment-image" src={url} /> : <div aria-label={alt} className="attachment-image-placeholder" />;
}
