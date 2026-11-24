import { useState } from 'react';
import {
  Activity,
  FlaskConical,
  Folder,
  Globe,
  Layers,
  PanelLeftOpen,
  Play,
  Plus,
  Settings,
  Tag,
  Trash2,
} from 'lucide-react';
import type { ProfilesOverview } from '@zita/shared';
import {
  Sidebar as CossSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { zitaIpc } from '@/lib/ipc';

export type NavSection = 'profiles' | 'proxies' | 'lab' | 'activity' | 'settings';
export type ProfileView = 'all' | 'running' | 'trash';

export interface AppSidebarProps {
  section: NavSection;
  profileView: ProfileView;
  activeFolderId?: string;
  activeStatusId?: string;
  activeTagId?: string;
  overview: ProfilesOverview | undefined;
  onSelectProfiles: (view: ProfileView, opts?: { folderId?: string; statusId?: string; tagId?: string }) => void;
  onSelectSection: (section: Exclude<NavSection, 'profiles'>) => void;
  onRefresh: () => void;
}

export function AppSidebar({
  section,
  profileView,
  activeFolderId,
  activeStatusId,
  activeTagId,
  overview,
  onSelectProfiles,
  onSelectSection,
  onRefresh,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const counts = overview?.counts ?? { all: 0, running: 0, trash: 0 };
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  return (
    <CossSidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-13 flex-row items-center justify-between gap-2 border-b border-sidebar-border px-2.5">
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="./brand/logo-dark.png"
              alt="ZED IT"
              className="zita-logo-dark h-4 w-auto shrink-0 object-contain"
            />
            <img
              src="./brand/logo-light.png"
              alt="ZED IT"
              className="zita-logo-light h-4 w-auto shrink-0 object-contain"
            />
            <span aria-hidden="true" className="h-3 w-px bg-sidebar-border" />
            <span className="type-micro truncate text-sidebar-foreground/70">Anti Browser</span>
          </div>
        ) : (
          <span
            aria-label="Zed IT Anti Browser"
            className="mx-auto flex h-5 items-center justify-center"
          >
            <img
              src="./brand/logo-dark.png"
              alt=""
              className="zita-logo-dark h-4 w-auto object-contain"
            />
            <img
              src="./brand/logo-light.png"
              alt=""
              className="zita-logo-light h-4 w-auto object-contain"
            />
          </span>
        )}
        {!collapsed && <SidebarTrigger className="shrink-0 text-sidebar-foreground/70" />}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={
                    section === 'profiles' &&
                    profileView === 'all' &&
                    !activeFolderId &&
                    !activeStatusId &&
                    !activeTagId
                  }
                  tooltip="All profiles"
                  onClick={() => onSelectProfiles('all')}
                >
                  <Layers />
                  <span>All profiles</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="type-numeric text-sidebar-foreground/55">{counts.all}</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={section === 'profiles' && profileView === 'running'}
                  tooltip="Running"
                  onClick={() => onSelectProfiles('running')}
                >
                  <Play />
                  <span>Running</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="type-numeric text-sidebar-foreground/55">{counts.running}</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={section === 'profiles' && profileView === 'trash'}
                  tooltip="Trash"
                  onClick={() => onSelectProfiles('trash')}
                >
                  <Trash2 />
                  <span>Trash</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="type-numeric text-sidebar-foreground/55">{counts.trash}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={section === 'proxies'}
                  tooltip="Proxies"
                  onClick={() => onSelectSection('proxies')}
                >
                  <Globe />
                  <span>Proxies</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={section === 'lab'}
                  tooltip="Fingerprint Lab"
                  onClick={() => onSelectSection('lab')}
                >
                  <FlaskConical />
                  <span>Fingerprint Lab</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={section === 'activity'}
                  tooltip="Activity"
                  onClick={() => onSelectSection('activity')}
                >
                  <Activity />
                  <span>Activity</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {overview && (
          <>
            <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel className="type-micro h-7 text-sidebar-foreground/55">Statuses</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {overview.statuses.map((st) => (
                    <SidebarMenuItem key={st.id}>
                      <SidebarMenuButton
                        size="sm"
                        isActive={section === 'profiles' && activeStatusId === st.id}
                        onClick={() => onSelectProfiles('all', { statusId: st.id })}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: st.color }}
                        />
                        <span>{st.name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="type-numeric text-sidebar-foreground/55">{st.profileCount}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel className="type-micro h-7 text-sidebar-foreground/55">Folders</SidebarGroupLabel>
              <SidebarGroupAction
                title="New folder"
                aria-label="New folder"
                onClick={() => setAddingFolder((v) => !v)}
              >
                <Plus />
              </SidebarGroupAction>
              <SidebarGroupContent>
                {addingFolder && (
                  <form
                    className="mb-1.5 px-1"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newFolderName.trim()) return;
                      await zitaIpc.createFolder({ name: newFolderName.trim() });
                      setNewFolderName('');
                      setAddingFolder(false);
                      onRefresh();
                    }}
                  >
                    <SidebarInput
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name..."
                    />
                  </form>
                )}
                <SidebarMenu>
                  {overview.folders.map((folder) => (
                    <SidebarMenuItem key={folder.id}>
                      <SidebarMenuButton
                        size="sm"
                        isActive={section === 'profiles' && activeFolderId === folder.id}
                        onClick={() => onSelectProfiles('all', { folderId: folder.id })}
                      >
                        <Folder />
                        <span>{folder.name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="type-numeric text-sidebar-foreground/55">{folder.profileCount}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel className="type-micro h-7 text-sidebar-foreground/55">Tags</SidebarGroupLabel>
              <SidebarGroupAction
                title="New tag"
                aria-label="New tag"
                onClick={() => setAddingTag((v) => !v)}
              >
                <Plus />
              </SidebarGroupAction>
              <SidebarGroupContent>
                {addingTag && (
                  <form
                    className="mb-1.5 px-1"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newTagName.trim()) return;
                      await zitaIpc.createTag({ name: newTagName.trim() });
                      setNewTagName('');
                      setAddingTag(false);
                      onRefresh();
                    }}
                  >
                    <SidebarInput
                      autoFocus
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Tag name..."
                    />
                  </form>
                )}
                <SidebarMenu>
                  {overview.tags.map((tag) => (
                    <SidebarMenuItem key={tag.id}>
                      <SidebarMenuButton
                        size="sm"
                        isActive={section === 'profiles' && activeTagId === tag.id}
                        onClick={() => onSelectProfiles('all', { tagId: tag.id })}
                      >
                        <Tag />
                        <span>{tag.name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="type-numeric text-sidebar-foreground/55">{tag.profileCount}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={section === 'settings'}
              tooltip="Settings"
              onClick={() => onSelectSection('settings')}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {collapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Expand sidebar"
                onClick={() => {
                  const trigger = document.querySelector<HTMLButtonElement>('[data-sidebar="rail"]');
                  trigger?.click();
                }}
              >
                <PanelLeftOpen />
                <span>Expand</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </CossSidebar>
  );
}
