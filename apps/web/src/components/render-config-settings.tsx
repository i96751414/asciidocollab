'use client';

/**
 * Project render-configuration editor: the AsciiDoc / Asciidoctor-PDF options a project applies to
 * every render (HTML preview + PDF export). Curated controls for the known options plus a free-form
 * custom-attributes table and an appended custom-font-directories list. Engine-pinned/unsafe attribute
 * names (base_dir, pdf-fontsdir, source-highlighter, …) are intentionally NOT exposed — see the shared
 * `PINNED_ATTRIBUTE_KEYS`; custom attributes colliding with them are dropped server-side. The document
 * language is NOT set here: it is the project's own "Language" setting (spell checker + render `lang`).
 */
import { useEffect, useState } from 'react';
import {
  Baseline,
  FileType,
  FlaskConical,
  Image as ImageIcon,
  Info,
  ListOrdered,
  ListTree,
  Monitor,
  Palette,
  Plus,
  RectangleHorizontal,
  Ruler,
  Scaling,
  Trash2,
  Type,
  WrapText,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderTreeSelect } from '@/components/folder-tree-select';
import { useProjectRenderConfig } from '@/hooks/use-project-render-config';
import { useProjectFolders } from '@/hooks/use-project-folders';
import { PDF_PAGE_SIZES, type RenderConfig } from '@asciidocollab/shared';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

const NO_FOLDERS_LABEL = 'No folders in this project yet.';

const DOCTYPE_OPTIONS = ['article', 'book'] as const;
const ICONS_OPTIONS = ['font', 'image'] as const;
const MEDIA_OPTIONS = ['screen', 'print', 'prepress'] as const;
const PAGE_LAYOUT_OPTIONS = ['portrait', 'landscape'] as const;

/** Return `value` when it is one of `options`, else undefined — narrows a select value without a cast. */
function pick<T extends string>(value: string, options: readonly T[]): T | undefined {
  return options.find((option) => option === value);
}

/** One editable custom-attribute row. The list keeps a trailing blank row so a new one can be appended. */
interface AttributeRow {
  name: string;
  value: string;
}

interface RenderConfigSettingsProperties {
  /** The project whose render config is edited. */
  projectId: string;
  /** When false, all controls are read-only (such as an archived project). */
  canEdit: boolean;
}

/** Turn a stored config's custom attributes into editable rows (plus one blank row to append). */
function toRows(config: RenderConfig): AttributeRow[] {
  const rows = Object.entries(config.customAttributes ?? {}).map(([name, value]) => ({ name, value }));
  return [...rows, { name: '', value: '' }];
}

/** Collapse editable rows back into a custom-attributes record (blank names dropped). */
function fromRows(rows: readonly AttributeRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (name.length > 0) {
      result[name] = row.value;
    }
  }
  return result;
}

/** The project render-configuration editor rendered inside the project settings page. */
export function RenderConfigSettings({ projectId, canEdit }: RenderConfigSettingsProperties): React.JSX.Element {
  const { config, loading, saving, error, save } = useProjectRenderConfig(projectId);
  const { tree, folders, loading: foldersLoading } = useProjectFolders(projectId);
  const [draft, setDraft] = useState<RenderConfig>({});
  const [fontDirectories, setFontDirectories] = useState<string[]>([]);
  const [rows, setRows] = useState<AttributeRow[]>([{ name: '', value: '' }]);
  const [saved, setSaved] = useState(false);

  // Seed the editable draft once the stored config arrives.
  useEffect(() => {
    setDraft(config);
    setFontDirectories(config.extraFontDirs ?? []);
    setRows(toRows(config));
  }, [config]);

  const disabled = !canEdit || saving;

  // Folder selections are validated against folders that EXIST; a stored value whose folder was
  // renamed/deleted is preserved (shown as a "not found" note / kept in state) rather than silently lost.
  const imagesDirectory = draft.imagesdir;
  const imagesDirectorySelected = new Set(imagesDirectory ? [imagesDirectory] : []);
  const imagesDirectoryMissing =
    imagesDirectory !== undefined && imagesDirectory !== '' && !folders.includes(imagesDirectory);
  const fontDirectoriesSelected = new Set(fontDirectories);
  const missingFontDirectories = fontDirectories.filter((folder) => !folders.includes(folder));

  function toggleFontDirectory(folder: string): void {
    setSaved(false);
    setFontDirectories((current) =>
      current.includes(folder) ? current.filter((entry) => entry !== folder) : [...current, folder],
    );
  }

  function set<K extends keyof RenderConfig>(key: K, value: RenderConfig[K]): void {
    setSaved(false);
    setDraft((current) => {
      const next = { ...current };
      if (value === undefined || value === '') {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    const customAttributes = fromRows(rows);
    const payload: RenderConfig = { ...draft };
    delete payload.extraFontDirs;
    delete payload.customAttributes;
    if (fontDirectories.length > 0) {
      payload.extraFontDirs = fontDirectories;
    }
    if (Object.keys(customAttributes).length > 0) {
      payload.customAttributes = customAttributes;
    }
    const ok = await save(payload);
    setSaved(ok);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading render options…</p>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
      {saved && (
        <div className="rounded-md border p-3 text-sm border-[hsl(var(--success-border))] bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]">
          Render options saved.
        </div>
      )}

      <fieldset className="space-y-6" disabled={disabled}>
        <div className="space-y-4">
          <SectionHeading>Document</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="rc-doctype" icon={FileType}>
                Document type
              </FieldLabel>
              <select
                id="rc-doctype"
                className={SELECT_CLASS}
                value={draft.doctype ?? ''}
                onChange={(event) => set('doctype', pick(event.target.value, DOCTYPE_OPTIONS))}
              >
                <option value="">Not set (article)</option>
                <option value="article">Article</option>
                <option value="book">Book</option>
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="rc-icons" icon={Info}>
                Admonition icons
              </FieldLabel>
              <select
                id="rc-icons"
                className={SELECT_CLASS}
                value={draft.icons ?? ''}
                onChange={(event) => set('icons', pick(event.target.value, ICONS_OPTIONS))}
              >
                <option value="">Not set</option>
                <option value="font">Font icons</option>
                <option value="image">Image icons</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <GroupLabel icon={ImageIcon}>Images directory</GroupLabel>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                className="h-4 w-4"
                checked={imagesDirectory === undefined || imagesDirectory === ''}
                disabled={disabled || foldersLoading}
                onChange={() => set('imagesdir', undefined)}
                aria-label="Project root (no images directory)"
              />
              Project root (none)
            </label>
            {foldersLoading ? (
              <p className="text-sm text-muted-foreground">Loading folders…</p>
            ) : (
              <FolderTreeSelect
                tree={tree}
                selected={imagesDirectorySelected}
                onToggle={(path) => set('imagesdir', path)}
                multi={false}
                disabled={disabled}
                ariaLabel="Images directory"
                emptyLabel={NO_FOLDERS_LABEL}
              />
            )}
            {imagesDirectoryMissing && (
              <p className="text-xs text-muted-foreground">
                Current: <code>{imagesDirectory}</code> — folder not found.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <CheckField
              label="Table of contents"
              icon={ListTree}
              checked={draft.toc === true}
              onChange={(checked) => set('toc', checked || undefined)}
            />
            <CheckField
              label="Number sections"
              icon={ListOrdered}
              checked={draft.sectnums === true}
              onChange={(checked) => set('sectnums', checked || undefined)}
            />
            <CheckField
              label="Experimental macros"
              icon={FlaskConical}
              checked={draft.experimental === true}
              onChange={(checked) => set('experimental', checked || undefined)}
            />
            <CheckField
              label="Hard line breaks"
              icon={WrapText}
              checked={draft.hardbreaks === true}
              onChange={(checked) => set('hardbreaks', checked || undefined)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeading>PDF layout</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="rc-theme" icon={Palette}>
                PDF theme name
              </FieldLabel>
              <Input
                id="rc-theme"
                value={draft.pdfTheme ?? ''}
                onChange={(event) => set('pdfTheme', event.target.value)}
                placeholder="acme (finds acme-theme.yml)"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="rc-media" icon={Monitor}>
                Output target
              </FieldLabel>
              <select
                id="rc-media"
                className={SELECT_CLASS}
                value={draft.media ?? ''}
                onChange={(event) => set('media', pick(event.target.value, MEDIA_OPTIONS))}
              >
                <option value="">Not set (screen)</option>
                <option value="screen">Screen</option>
                <option value="print">Print</option>
                <option value="prepress">Prepress</option>
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="rc-page-size" icon={Ruler}>
                Page size
              </FieldLabel>
              <select
                id="rc-page-size"
                className={SELECT_CLASS}
                value={draft.pdfPageSize ?? ''}
                onChange={(event) => set('pdfPageSize', pick(event.target.value, PDF_PAGE_SIZES))}
              >
                <option value="">Not set</option>
                {PDF_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="rc-page-layout" icon={RectangleHorizontal}>
                Orientation
              </FieldLabel>
              <select
                id="rc-page-layout"
                className={SELECT_CLASS}
                value={draft.pdfPageLayout ?? ''}
                onChange={(event) => set('pdfPageLayout', pick(event.target.value, PAGE_LAYOUT_OPTIONS))}
              >
                <option value="">Not set</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <CheckField
              label="Hyphenation"
              icon={Baseline}
              checked={draft.hyphens === true}
              onChange={(checked) => set('hyphens', checked || undefined)}
            />
            <CheckField
              label="Auto-fit wide blocks"
              icon={Scaling}
              checked={draft.autofit === true}
              onChange={(checked) => set('autofit', checked || undefined)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <GroupLabel icon={Type}>Custom font directories</GroupLabel>
          <p className="text-sm text-muted-foreground">
            Existing project folders to add to the PDF font search path (appended — they never replace
            the built-in fonts). Pick folders that contain your <code>.ttf</code>/<code>.otf</code> files.
          </p>
          {foldersLoading ? (
            <p className="text-sm text-muted-foreground">Loading folders…</p>
          ) : (
            <FolderTreeSelect
              tree={tree}
              selected={fontDirectoriesSelected}
              onToggle={toggleFontDirectory}
              multi
              disabled={disabled}
              ariaLabel="Custom font directories"
              emptyLabel={NO_FOLDERS_LABEL}
            />
          )}
          {missingFontDirectories.length > 0 && (
            <ul className="space-y-1">
              {missingFontDirectories.map((folder) => (
                <li key={folder} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    <code>{folder}</code> — folder not found
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove font directory ${folder}`}
                    onClick={() => toggleFontDirectory(folder)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <SectionHeading>Custom attributes</SectionHeading>
          <p className="text-sm text-muted-foreground">
            Shared AsciiDoc attributes applied to every document (a document header still overrides
            them). Reserved engine attributes are ignored.
          </p>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Attribute name ${index + 1}`}
                  value={row.name}
                  placeholder="company"
                  onChange={(event) => updateRow(setRows, setSaved, index, 'name', event.target.value)}
                />
                <Input
                  aria-label={`Attribute value ${index + 1}`}
                  value={row.value}
                  placeholder="Acme Corp"
                  onChange={(event) => updateRow(setRows, setSaved, index, 'value', event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove attribute ${index + 1}`}
                  onClick={() => removeRow(setRows, setSaved, index)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSaved(false);
                setRows((current) => [...current, { name: '', value: '' }]);
              }}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Add attribute
            </Button>
          </div>
        </div>
      </fieldset>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save render options'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A plain section heading, matching the icon-less headings elsewhere on the settings page. */
function SectionHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

/** A field label with a leading icon, associated with an input by id (keeps `getByLabel` text). */
function FieldLabel({
  htmlFor,
  icon: Icon,
  children,
}: {
  htmlFor: string;
  icon: LucideIcon;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {children}
    </Label>
  );
}

/** A group label with a leading icon for a control group (radios/tree) that has no single input id. */
function GroupLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {children}
    </p>
  );
}

/** A labelled checkbox styled to match the settings forms. */
function CheckField({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {label}
    </label>
  );
}

/** Update one field of one custom-attribute row immutably. */
function updateRow(
  setRows: React.Dispatch<React.SetStateAction<AttributeRow[]>>,
  setSaved: React.Dispatch<React.SetStateAction<boolean>>,
  index: number,
  field: keyof AttributeRow,
  value: string,
): void {
  setSaved(false);
  setRows((current) => current.map((row, position) => (position === index ? { ...row, [field]: value } : row)));
}

/** Remove one custom-attribute row, always leaving at least one (blank) row to type into. */
function removeRow(
  setRows: React.Dispatch<React.SetStateAction<AttributeRow[]>>,
  setSaved: React.Dispatch<React.SetStateAction<boolean>>,
  index: number,
): void {
  setSaved(false);
  setRows((current) => {
    const next = current.filter((_row, position) => position !== index);
    return next.length > 0 ? next : [{ name: '', value: '' }];
  });
}
