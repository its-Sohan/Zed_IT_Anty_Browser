import { useMemo } from 'react';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

export interface CommandAction {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  run: () => void;
}

interface CommandGroupBucket {
  value: string;
  items: CommandAction[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandAction[];
}

export function CommandPalette({ open, onOpenChange, actions }: CommandPaletteProps) {
  const groupedActions = useMemo<CommandGroupBucket[]>(() => {
    const map = new Map<string, CommandAction[]>();
    for (const action of actions) {
      const list = map.get(action.group);
      if (list) {
        list.push(action);
      } else {
        map.set(action.group, [action]);
      }
    }
    return Array.from(map.entries()).map(([value, items]) => ({ value, items }));
  }, [actions]);

  const execute = (action: CommandAction) => {
    onOpenChange(false);
    action.run();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <Command
          items={groupedActions}
          itemToStringValue={(item) => `${(item as CommandAction).group} ${(item as CommandAction).label}`}
        >
          <CommandInput placeholder="Jump to view, settings, or action..." />
          <CommandPanel>
            <CommandEmpty>No matching commands</CommandEmpty>
            <CommandList>
              {(group: CommandGroupBucket) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(action: CommandAction) => (
                      <CommandItem
                        key={action.id}
                        value={action}
                        onClick={() => execute(action)}
                      >
                        <span className="flex-1 truncate">{action.label}</span>
                        {action.shortcut ? (
                          <CommandShortcut>{action.shortcut}</CommandShortcut>
                        ) : (
                          <CommandShortcut>{action.group}</CommandShortcut>
                        )}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <KbdGroup>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </KbdGroup>
                <span>Navigate</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                <span>Run</span>
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span>Close</span>
            </span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
