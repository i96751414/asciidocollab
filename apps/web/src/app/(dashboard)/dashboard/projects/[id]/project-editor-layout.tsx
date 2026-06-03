'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileTree } from '@/components/file-tree/file-tree';
import { FileContentPanel } from '@/components/file-content-panel';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { useFileSelection } from '@/hooks/use-file-selection';

interface ProjectEditorLayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  isOwner: boolean;
}

/** Three-panel editor layout: collapsible file tree, read-only content viewer, AsciiDoc preview. */
export function ProjectEditorLayout({
  projectId,
  projectName,
  projectDescription,
  isOwner,
}: ProjectEditorLayoutProperties) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { selectedFile, contentState, selectFile } = useFileSelection(projectId);

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
          <div className="flex items-center justify-between p-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Files</span>
            <button
              aria-label="collapse sidebar"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              ‹
            </button>
          </div>
          <FileTree
            projectId={projectId}
            isOwner={isOwner}
            onSelectFile={(nodeId, nodeName, nodePath, nodeType) => selectFile(nodeId, nodeName, nodePath, nodeType)}
            selectedNodeId={selectedFile?.nodeId ?? null}
          />
        </div>

        {!sidebarOpen && (
          <button
            aria-label="expand sidebar"
            className="w-6 shrink-0 border-r flex items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            ›
          </button>
        )}

        {/* Content panel */}
        <div data-testid="content-panel" className="flex-1 overflow-auto p-4">
          <FileContentPanel selectedFile={selectedFile} contentState={contentState} />
        </div>

        {/* Preview panel */}
        <div data-testid="preview-panel" className="w-80 shrink-0 border-l overflow-hidden">
          {showPreview ? (
            <AsciiDocPreview
              content={contentState.content ?? ''}
              isOpen={previewOpen}
              onToggle={togglePreview}
            />
          ) : (
            <div className="p-4">
              <p className="text-muted-foreground text-sm">Preview not available for this file type.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
