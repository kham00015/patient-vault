#!/bin/sh
set -e
# Named volumes mount as root; app runs as nextjs and must write uploads here.
if [ -d /app/storage ]; then
  chown -R nextjs:nodejs /app/storage 2>/dev/null || true
fi
exec su-exec nextjs "$@"
