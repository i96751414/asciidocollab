'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { FileTree } from '@/components/file-tree/file-tree';
import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { ImagePreview } from '@/components/image-preview';
import { isImageFile } from '@/lib/codemirror/asciidoc-image-extensions';
import type { ScrollRequest } from '@/hooks/use-asciidoc-preview';
import { useFileSelection } from '@/hooks/use-file-selection';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';

import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';

interface ContentAreaProperties {
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  canEdit: boolean;
  projectId: string;
  onScrollLine?: (line: number) => void;
  onLineClick?: (line: number) => void;
  onChange?: (value: string) => void;
}

function ContentArea({
  selectedFile,
  contentState,
  canEdit,
  projectId,
  onScrollLine,
  onLineClick,
  onChange,
}: ContentAreaProperties) {
  if (selectedFile === null) {
    return <p className="text-muted-foreground text-sm p-4">Select a file from the tree to view its content.</p>;
  }
  if (contentState.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (contentState.isBinary) {
    if (isImageFile(selectedFile.nodeName)) {
      return (
        <ImagePreview
          key={selectedFile.nodeId}
          projectId={projectId}
          fileNodeId={selectedFile.nodeId}
          fileName={selectedFile.nodeName}
        />
      );
    }
    return <p className="text-muted-foreground text-sm p-4">Preview not available for binary files.</p>;
  }
  if (contentState.error) {
    return <p className="text-destructive text-sm p-4">{contentState.error}</p>;
  }
  return (
    <AsciiDocEditor
      key={selectedFile.nodeId}
      content={contentState.content ?? ''}
      canEdit={canEdit}
      projectId={projectId}
      fileNodeId={selectedFile.nodeId}
      initialEtag={contentState.etag}
      isAsciiDoc={isAsciiDocFile(selectedFile.nodeName)}
      onScrollLine={onScrollLine}
      onLineClick={onLineClick}
      onChange={onChange}
    />
  );
}

interface ProjectEditorLayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  isOwner: boolean;
  canEdit: boolean;
}

/** Three-panel editor layout: collapsible file tree, CM6 editor, AsciiDoc preview. */
export function ProjectEditorLayout({
  projectId,
  projectName,
  projectDescription,
  isOwner,
  canEdit,
}: ProjectEditorLayoutProperties) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  // Track the last line scrolled via scroll-sync to deduplicate rapid fire events.
  const lastScrolledLine = useRef<number | null>(null);
  // Track live editor content so the preview reflects what the user is typing.
  const [liveContent, setLiveContent] = useState('');
  const { selectedFile, contentState, selectFile } = useFileSelection(projectId);
  const { scrollSyncEnabled, setScrollSyncEnabled } = useEditorPreferences();

  // Scroll-sync handler: dedup identical consecutive lines to avoid jitter.
  const handleScrollLine = useCallback((line: number) => {
    if (lastScrolledLine.current === line) return;
    lastScrolledLine.current = line;
    setScrollRequest({ line });
  }, []);

  // Line-click handler: always fires, even for the same line clicked twice.
  // No dedup — the user intentionally clicked, so we always issue a fresh scroll.
  const handleLineClick = useCallback((line: number) => {
    setScrollRequest({ line });
  }, []);

  // Sync live content when a different file is loaded.
  useEffect(() => {
    setLiveContent(contentState.content ?? '');
  }, [selectedFile?.nodeId, contentState.content]);

  // Reset scroll position whenever a different file is opened.
  useEffect(() => {
    setScrollRequest(null);
    lastScrolledLine.current = null;
  }, [selectedFile?.nodeId]);

  useEffect(() => {
    const stored = sessionStorage.getItem('asciidoc-preview-open');
    if (stored === 'true') setPreviewOpen(true);
  }, []);

  const togglePreview = () => {
    setPreviewOpen((previous) => {
      const next = !previous;
      sessionStorage.setItem('asciidoc-preview-open', String(next));
      return next;
    });
  };

  const showPreview = selectedFile !== null && isAsciiDocFile(selectedFile.nodeName);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 p-3 border-b shrink-0">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to projects
        </Link>
        <span className="font-semibold text-sm">{projectName}</span>
        {projectDescription && (
          <span className="text-xs text-muted-foreground">{projectDescription}</span>
        )}
        {isOwner && (
          <>
            <Link
              href={`/dashboard/projects/${projectId}/settings`}
              className="text-sm text-muted-foreground hover:text-foreground ml-auto"
            >
              Settings
            </Link>
            <Link
              href={`/dashboard/projects/${projectId}/members`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Members
            </Link>
          </>
        )}
      </div>

      {/* Body: sidebar + content + preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree panel */}
        <div
          data-testid="file-tree-panel"
          className={sidebarOpen ? 'w-64 shrink-0 border-r overflow-y-auto' : 'hidden'}
        >
          <FileTree
            projectId={projectId}
            isOwner={isOwner}
            onSelectFile={(nodeId, nodeName, nodePath, nodeType) => selectFile(nodeId, nodeName, nodePath, nodeType)}
            selectedNodeId={selectedFile?.nodeId ?? null}
            onCollapse={() => setSidebarOpen(false)}
          />
        </div>

        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="expand sidebar"
            className="w-6 h-full shrink-0 border-r rounded-none"
            onClick={() => setSidebarOpen(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Editor + Preview panels — resizable when preview is open */}
        {showPreview && previewOpen ? (
          <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
            <Panel defaultSize={50} minSize={20} className="overflow-hidden flex flex-col p-4" data-testid="content-panel">
              <ContentArea
                selectedFile={selectedFile}
                contentState={contentState}
                canEdit={canEdit}
                projectId={projectId}
                onScrollLine={scrollSyncEnabled ? handleScrollLine : undefined}
                onLineClick={handleLineClick}
                onChange={setLiveContent}
              />
            </Panel>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />
            <Panel defaultSize={50} minSize={20} className="overflow-hidden border-l" data-testid="preview-panel">
              <AsciiDocPreview
                content={liveContent}
                isEnabled={previewOpen}
                scrollToLine={scrollRequest}
                onCollapse={togglePreview}
                scrollSyncEnabled={scrollSyncEnabled}
                onToggleScrollSync={() => setScrollSyncEnabled(!scrollSyncEnabled)}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <>
            <div data-testid="content-panel" className="flex-1 overflow-hidden flex flex-col p-4">
              <ContentArea
                selectedFile={selectedFile}
                contentState={contentState}
                canEdit={canEdit}
                projectId={projectId}
                onChange={setLiveContent}
              />
            </div>
            {showPreview && !previewOpen && (
              <Button
                data-testid="preview-panel"
                variant="ghost"
                size="icon"
                aria-label="expand preview"
                className="w-6 h-full shrink-0 border-l rounded-none"
                onClick={togglePreview}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
