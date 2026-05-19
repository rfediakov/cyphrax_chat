import { useEffect, useState } from 'react';
import api from '../api/axios';

/** Resolves `/api/v1/attachments/:id` to an axios path under `baseURL` `/api/v1`. */
function attachmentRequestPath(apiRelativePath: string): string | null {
  const m = apiRelativePath.match(/\/attachments\/([^/?#]+)/);
  return m ? `attachments/${m[1]}` : null;
}

/**
 * Loads a membership-gated attachment via the API client (Bearer + refresh)
 * and exposes a `blob:` URL for native media tags, which cannot send auth headers.
 */
export function useAuthorizedAttachmentBlobUrl(apiRelativePath: string | undefined | null): {
  blobUrl: string | undefined;
  loading: boolean;
  error: boolean;
} {
  const [blobUrl, setBlobUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(Boolean(apiRelativePath));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!apiRelativePath) {
      setBlobUrl(undefined);
      setLoading(false);
      setError(false);
      return;
    }

    const reqPath = attachmentRequestPath(apiRelativePath);
    if (!reqPath) {
      setBlobUrl(undefined);
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    setLoading(true);
    setError(false);

    void (async () => {
      try {
        const { data } = await api.get<Blob>(reqPath, { responseType: 'blob' });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setError(true);
          setBlobUrl(undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiRelativePath]);

  return { blobUrl, loading, error };
}
