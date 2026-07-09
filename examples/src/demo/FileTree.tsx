import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { MuiThemeBridge } from "../mui/MuiThemeBridge";
import type { DemoFile } from "./demoSources";

export type FileTreeProps = Readonly<{
  files: readonly DemoFile[];
  selected: string;
  onSelect: (path: string) => void;
}>;

type TreeNode = Readonly<{
  id: string; // folder ids end with "/", file ids are the full path
  name: string;
  children: readonly TreeNode[];
}>;

// Fold the flat path list into a folder tree, preserving the incoming file
// order (demoSources sorts modules into reading order).
const buildTree = (files: readonly DemoFile[]): readonly TreeNode[] =>
  files.reduce<readonly TreeNode[]>((nodes, file) => {
    const segments = file.path.split("/");
    const insert = (
      level: readonly TreeNode[],
      index: number,
      prefix: string,
    ): readonly TreeNode[] => {
      const name = segments[index] ?? "";
      const isFile = index === segments.length - 1;
      const id = isFile ? file.path : `${prefix}${name}/`;
      const existing = level.find((node) => node.id === id);
      if (existing === undefined) {
        const node: TreeNode = {
          id,
          name,
          children: isFile ? [] : insert([], index + 1, id),
        };
        return [...level, node];
      }
      return level.map((node) =>
        node === existing
          ? { ...node, children: insert(node.children, index + 1, id) }
          : node,
      );
    };
    return insert(nodes, 0, "");
  }, []);

const collectFolderIds = (nodes: readonly TreeNode[]): readonly string[] =>
  nodes.flatMap((node) =>
    node.id.endsWith("/")
      ? [node.id, ...collectFolderIds(node.children)]
      : [],
  );

const renderNodes = (nodes: readonly TreeNode[]) =>
  nodes.map((node) => (
    <TreeItem
      key={node.id}
      itemId={node.id}
      label={
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {node.id.endsWith("/") ? (
            <FolderRoundedIcon sx={{ fontSize: 16, color: "#d99a3d" }} />
          ) : (
            <InsertDriveFileOutlinedIcon
              sx={{ fontSize: 15, color: "#7c879b" }}
            />
          )}
          <span style={{ fontSize: 13, fontFamily: "ui-monospace, monospace" }}>
            {node.name}
          </span>
        </span>
      }
    >
      {node.children.length > 0 ? renderNodes(node.children) : null}
    </TreeItem>
  ));

export const FileTree = ({ files, selected, onSelect }: FileTreeProps) => {
  const tree = buildTree(files);
  return (
    <MuiThemeBridge>
      <SimpleTreeView
        selectedItems={selected}
        defaultExpandedItems={[...collectFolderIds(tree)]}
        onSelectedItemsChange={(_event, itemId) => {
          // Folders (ids ending in "/") only expand/collapse; files select.
          if (typeof itemId === "string" && !itemId.endsWith("/")) {
            onSelect(itemId);
          }
        }}
        sx={{
          py: 0.5,
          "& .MuiTreeItem-content": { py: 0.25, borderRadius: 1 },
          "& .MuiTreeItem-content.Mui-selected": {
            backgroundColor: "rgba(226, 169, 78, 0.16)",
          },
          "& .MuiTreeItem-content.Mui-selected:hover": {
            backgroundColor: "rgba(226, 169, 78, 0.24)",
          },
        }}
      >
        {renderNodes(tree)}
      </SimpleTreeView>
    </MuiThemeBridge>
  );
};
