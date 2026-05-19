import {
  useState,
  useCallback,
  ComponentProps,
  useRef,
  ChangeEvent,
} from 'react';
import { Command, GripVertical, Plus, Save, Sparkles, Upload } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import { SettingsDialog } from '@/components/settings-dialog';
import { SaveProjectDialog } from '@/components/save-project-dialog';
import nodesConfig, {
  AppNode,
  createNodeByType,
  type NodeConfig,
} from '@/components/nodes';
import {
  ALL_ENTRIES as MANIFEST_ENTRIES,
  type ManifestEntry,
} from '@/flow/manifest';
import { createTransformNode } from '@/flow/transform-node';
import { cn } from '@/lib/utils';
import { iconMapping } from '@/data/icon-mapping';
import { useAppStore } from '@/store/app-context';
import { useShallow } from 'zustand/react/shallow';
import { type AppStore } from '@/store/app-store';
import {
  saveStateToFile,
  deserializeStateFromFile,
} from '@/lib/state-serialization';
import { useStrudelStore } from '@/store/strudel-store';

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    nodes,
    edges,
    theme,
    colorMode,
    setNodes,
    setEdges,
    setTheme,
    setColorMode,
  } = useAppStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      theme: state.theme,
      colorMode: state.colorMode,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      setTheme: state.setTheme,
      setColorMode: state.setColorMode,
    }))
  );
  const { cpm, bpc, setCpm, setBpc } = useStrudelStore(
    useShallow((state) => ({
      cpm: state.cpm,
      bpc: state.bpc,
      setCpm: state.setCpm,
      setBpc: state.setBpc,
    }))
  );

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveFilename, setSaveFilename] = useState('strudel-flow-project.json');

  const handleSave = () => {
    saveStateToFile(
      nodes,
      edges,
      theme,
      colorMode,
      cpm,
      bpc,
      saveFilename
    );
    setIsSaveDialogOpen(false);
  };

  const handleLoad = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const state = deserializeStateFromFile(content);
        if (state) {
          const nodes = (state.nodes as AppNode[]).map((node) => ({
            ...node,
            data: {
              ...node.data,
              state: 'paused' as const,
            },
          }));
          setNodes(nodes);
          setEdges(state.edges);
          setTheme(state.theme);
          setColorMode(state.colorMode);
          setCpm(state.cpm);
          if (state.bpc) {
            setBpc(state.bpc);
          }
        }
      };
      reader.readAsText(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Group nodes by category
  const nodesByCategory = Object.values(nodesConfig).reduce((acc, node) => {
    if (!acc[node.category]) {
      acc[node.category] = [];
    }
    acc[node.category].push(node);
    return acc;
  }, {} as Record<string, NodeConfig[]>);

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader className="py-0">
        <div className="flex gap-2 px-1 h-14 items-center ">
          <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Command className="size-3" />
          </div>
          <span className="truncate font-semibold">Strata</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ManifestPalette />
        {Object.entries(nodesByCategory).map(([category, nodes]) => (
          <SidebarGroup key={category}>
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground capitalize">
              {category}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nodes.map((item) => (
                  <DraggableItem key={item.title} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SaveProjectDialog
                  isOpen={isSaveDialogOpen}
                  onOpenChange={setIsSaveDialogOpen}
                  filename={saveFilename}
                  onFilenameChange={setSaveFilename}
                  onSave={handleSave}
                >
                  <SidebarMenuButton className="bg-card cursor-pointer">
                    <Save />
                    <span>Save</span>
                  </SidebarMenuButton>
                </SaveProjectDialog>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={triggerFileInput}
                  className="bg-card cursor-pointer"
                >
                  <Upload />
                  <span>Load</span>
                </SidebarMenuButton>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLoad}
                  className="hidden"
                  accept=".json"
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <SettingsDialog />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

const selector = (state: AppStore) => ({
  addNode: state.addNode,
});

/**
 * M2 manifest-driven transforms — the new generic TransformNode and its
 * starter manifest entries. Lives in a separate sidebar section during M2
 * so the kids can see "new" vs the inherited bespoke nodes, and so the
 * higher-order port prototype (jux) is easy to find for kid testing.
 *
 * Folds into the regular palette once the inherited effect nodes are
 * migrated onto manifest entries (M2 phase 4).
 */
function ManifestPalette() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs font-medium text-muted-foreground capitalize">
        Transforms (M2 preview)
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {MANIFEST_ENTRIES.map((entry) => (
            <ManifestPaletteItem key={entry.id} entry={entry} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ManifestPaletteItem({ entry }: { entry: ManifestEntry }) {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode } = useAppStore(useShallow(selector));

  const onClick = useCallback(() => {
    const node = createTransformNode(
      entry.id,
      screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
    );
    // The store's AppNode union does not yet include the M2 transform
    // arm (the inherited types would cascade — see audit). React Flow
    // accepts the node at runtime; the cast is scoped here.
    addNode(node as unknown as AppNode);
  }, [entry.id, addNode, screenToFlowPosition]);

  return (
    <SidebarMenuItem
      className="relative border-2 active:scale-[.99] rounded-md border"
      onClick={onClick}
      key={entry.id}
    >
      <SidebarMenuButton className="bg-card cursor-pointer">
        <Sparkles className="size-4" />
        <span>{entry.label}</span>
        {entry.kind === 'higher-order' && (
          <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
            HO
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function DraggableItem(props: NodeConfig) {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode } = useAppStore(useShallow(selector));
  const [isDragging, setIsDragging] = useState(false);

  const onClick = useCallback(() => {
    const newNode: AppNode = createNodeByType({
      type: props.id,
      position: screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    });

    addNode(newNode);
  }, [props, addNode, screenToFlowPosition]);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/reactflow', JSON.stringify(props));
      setIsDragging(true);
    },
    [props]
  );

  const lastDragPos = useRef({ x: 0, y: 0 });

  function onDrag(e: React.DragEvent) {
    const lastPos = lastDragPos.current;
    if (lastPos.x === e.clientX && lastPos.y === e.clientY) {
      return;
    }
    lastDragPos.current = { x: e.clientX, y: e.clientY };
  }

  function onDragEnd() {
    setIsDragging(false);
  }

  const IconComponent = props?.icon ? iconMapping[props.icon] : undefined;

  return (
    <SidebarMenuItem
      className={cn(
        'relative border-2 active:scale-[.99] rounded-md',
        isDragging ? 'border-green-500' : 'border'
      )}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onClick={onClick}
      draggable
      key={props.title}
    >
      {isDragging && (
        <span
          role="presentation"
          className="absolute -top-3 -right-3 rounded-md border-2 border-green-500 bg-card"
        >
          <Plus className="size-4" />
        </span>
      )}
      <SidebarMenuButton className="bg-card cursor-grab active:cursor-grabbing">
        {IconComponent ? <IconComponent aria-label={props?.icon} /> : null}
        <span>{props.title}</span>
        <GripVertical className="ml-auto" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
