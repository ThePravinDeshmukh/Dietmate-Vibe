import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, CircularProgress, Alert
} from '@mui/material';

interface SystemPromptDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SystemPromptDialog({ open, onClose }: SystemPromptDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError('');

    fetch('/api/chat/system-prompt')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load system prompt');
        return r.json();
      })
      .then(data => {
        setPrompt(data.prompt || '');
      })
      .catch(e => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Assistant System Prompt</DialogTitle>
      <DialogContent sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {loading && <CircularProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {prompt && (
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {prompt}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
