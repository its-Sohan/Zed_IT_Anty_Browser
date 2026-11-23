import { useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { CsvPreviewDto } from '@zita/shared';
import { Badge } from '@/components/ui/badge';
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
import { Frame, FramePanel } from '@/components/ui/frame';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';

export interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const SAMPLE_CSV = `name,os,proxy,tags,folder,notes
Client A - FB 01,windows,socks5://user:pass@203.0.113.10:1080,fb;client-a,Clients,Warmed account
Client B - Store 01,macos,,ecom;us,Ecom,Clean storefront`;

export function CsvImportDialog({ open, onOpenChange, onImported }: CsvImportDialogProps) {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState<CsvPreviewDto | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePreview = async () => {
    setBusy(true);
    try {
      const res = await zitaIpc.previewCsv({ csvText });
      setPreview(res);
    } catch (err) {
      toastManager.add({
        title: 'CSV parse error',
        description: err instanceof Error ? err.message : 'Unable to parse CSV',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const res = await zitaIpc.importCsv({ csvText });
      toastManager.add({
        title: `Imported ${res.importedCount} profiles`,
        description:
          res.createdProxiesCount > 0
            ? `Created ${res.createdProxiesCount} inline proxies; ${res.errors.length} skipped rows.`
            : `${res.errors.length} skipped rows.`,
        type: 'success',
      });
      setPreview(null);
      onImported();
      onOpenChange(false);
    } catch (err) {
      toastManager.add({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Unable to import CSV',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" strokeWidth={1.5} />
              <DialogTitle>Import profiles from CSV</DialogTitle>
            </div>
            <Button variant="outline" size="sm" render={<label className="cursor-pointer" />}>
              <Upload className="size-3.5" strokeWidth={1.5} />
              Load .csv file
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="sr-only" />
            </Button>
          </div>
          <DialogDescription>
            Supported headers: <code className="font-mono-tabular">name</code> (required),{' '}
            <code className="font-mono-tabular">os</code>, <code className="font-mono-tabular">proxy</code>,{' '}
            <code className="font-mono-tabular">tags</code> (<code className="font-mono-tabular">;</code> separated),{' '}
            <code className="font-mono-tabular">folder</code>, <code className="font-mono-tabular">notes</code>,{' '}
            <code className="font-mono-tabular">start_pages</code>.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-3">
          <Textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
            }}
            className="font-mono-tabular [&_textarea]:h-40 [&_textarea]:text-xs"
          />

          {preview && (
            <Frame>
              <FramePanel className="space-y-2 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="success">{preview.validRows.length} valid</Badge>
                  <Badge variant={preview.errors.length > 0 ? 'error' : 'secondary'}>
                    {preview.errors.length} errors
                  </Badge>
                </div>
                {preview.errors.length > 0 && (
                  <ScrollArea className="max-h-24">
                    <ul className="space-y-1 text-destructive-foreground">
                      {preview.errors.map((err, i) => (
                        <li key={i}>
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </FramePanel>
            </Frame>
          )}
        </DialogPanel>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={busy || !csvText.trim()} onClick={handlePreview}>
            Validate & Preview
          </Button>
          <Button
            variant="default"
            disabled={busy || !csvText.trim() || (preview !== null && preview.validRows.length === 0)}
            onClick={handleImport}
          >
            Import {preview ? `${preview.validRows.length} rows` : 'CSV'}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
