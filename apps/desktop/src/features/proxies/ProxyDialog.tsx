import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ProxyProtocol, ProxySummary } from '@zita/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';

const PROTOCOL_ITEMS: Array<{ value: ProxyProtocol; label: string }> = [
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

const DEFAULTS = {
  label: '',
  protocol: 'socks5' as ProxyProtocol,
  host: '',
  port: '1080',
  username: '',
  password: '',
};

export interface ProxyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProxy?: ProxySummary | null;
  onSaved: (proxy: ProxySummary) => void;
}

export function ProxyDialog({ open, onOpenChange, editingProxy, onSaved }: ProxyDialogProps) {
  const [form, setForm] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingProxy) {
      setForm({
        label: editingProxy.label,
        protocol: editingProxy.protocol,
        host: editingProxy.host,
        port: String(editingProxy.port),
        username: editingProxy.username ?? '',
        password: '',
      });
    } else {
      setForm(DEFAULTS);
    }
  }, [open, editingProxy]);

  const set = <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const portNum = Number.parseInt(form.port, 10);
      const saved = editingProxy
        ? await zitaIpc.updateProxy({
            id: editingProxy.id,
            label: form.label,
            protocol: form.protocol,
            host: form.host,
            port: portNum,
            username: form.username || null,
            password: form.password ? form.password : null,
          })
        : await zitaIpc.createProxy({
            label: form.label,
            protocol: form.protocol,
            host: form.host,
            port: portNum,
            username: form.username || null,
            password: form.password || null,
          });
      toastManager.add({
        title: editingProxy ? 'Proxy updated' : 'Proxy added',
        type: 'success',
      });
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      toastManager.add({
        title: 'Failed to save proxy',
        description: err instanceof Error ? err.message : 'Invalid input',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingProxy ? 'Edit proxy' : 'Add proxy'}</DialogTitle>
          <DialogDescription>
            Credentials are encrypted at rest and routed locally through a loopback SOCKS5 bridge.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="contents">
          <DialogPanel className="space-y-3">
            <Field>
              <FieldLabel htmlFor="px-label">Label</FieldLabel>
              <Input
                id="px-label"
                required
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="US Residential 01"
              />
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field>
                <FieldLabel>Protocol</FieldLabel>
                <Select
                  items={PROTOCOL_ITEMS}
                  value={form.protocol}
                  onValueChange={(val) => {
                    if (val) set('protocol', val as ProxyProtocol);
                  }}
                >
                  <SelectTrigger className="min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {PROTOCOL_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="px-host">Host</FieldLabel>
                <Input
                  id="px-host"
                  required
                  value={form.host}
                  onChange={(e) => set('host', e.target.value)}
                  placeholder="203.0.113.10"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="px-port">Port</FieldLabel>
                <Input
                  id="px-port"
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => set('port', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="px-user">Username (optional)</FieldLabel>
                <Input
                  id="px-user"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="px-pass">
                  {editingProxy ? 'New password (leave blank to keep)' : 'Password (optional)'}
                </FieldLabel>
                <Input
                  id="px-pass"
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                />
              </Field>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={busy}>
              <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
              {busy ? 'Saving...' : 'Save proxy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
