import { useEffect, useRef, useState } from 'react';
import {
  Bold, Check, ExternalLink, Heading1, Heading2, Highlighter, Image, Italic, Link2,
  List, ListOrdered, Pencil, Plus, Quote, Redo2, Trash2, Underline, Undo2, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const EMPTY_DOCUMENT = '<h1>Project briefing</h1><p>Start writing your brief here. Add context, goals, deliverables and everything the team needs to get started.</p>';
const EDITOR_FONTS = [
  ['Inter', 'Inter'],
  ['Roboto', 'Roboto'],
  ['Open Sans', 'Open Sans'],
  ['Lato', 'Lato'],
  ['Montserrat', 'Montserrat'],
  ['Merriweather', 'Merriweather'],
  ['Playfair Display', 'Playfair Display'],
];
const EDITOR_FONT_SIZES = [
  ['12 px', '1'],
  ['14 px', '2'],
  ['16 px', '3'],
  ['18 px', '4'],
  ['24 px', '5'],
  ['32 px', '6'],
  ['48 px', '7'],
];

function storageKey(projectId) {
  return `post-planner:brief:${projectId}`;
}

function loadBrief(projectId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(projectId))) ?? {};
  } catch {
    return {};
  }
}

function normaliseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ToolbarButton({ label, children, onClick }) {
  return (
    <button type="button" className="brief-toolbar-button" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

export default function BriefPage({ project }) {
  const { user, demoMode, hasSupabaseConfig } = useAuth();
  const useSupabase = hasSupabaseConfig && !demoMode;
  const initial = useRef(loadBrief(project.id));
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const [title, setTitle] = useState(initial.current.title ?? `${project.name} brief`);
  const [content, setContent] = useState(initial.current.content ?? EMPTY_DOCUMENT);
  const [links, setLinks] = useState(initial.current.links ?? []);
  const [saveState, setSaveState] = useState('Saved');
  const [databaseReady, setDatabaseReady] = useState(!useSupabase);
  const [dialog, setDialog] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!useSupabase) {
      setDatabaseReady(true);
      return undefined;
    }

    let alive = true;
    setDatabaseReady(false);
    setSaveState('Loading…');
    supabase
      .from('project_briefs')
      .select('title,content,links')
      .eq('project_id', project.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('Could not load project brief', error);
          setSaveState('Could not load');
          return;
        }
        if (data) {
          const nextTitle = data.title ?? `${project.name} brief`;
          const nextContent = data.content ?? EMPTY_DOCUMENT;
          const nextLinks = Array.isArray(data.links) ? data.links : [];
          setTitle(nextTitle);
          setContent(nextContent);
          setLinks(nextLinks);
          if (editorRef.current) editorRef.current.innerHTML = nextContent;
          localStorage.setItem(storageKey(project.id), JSON.stringify({ title: nextTitle, content: nextContent, links: nextLinks }));
        }
        setDatabaseReady(true);
        setSaveState('Saved');
      });
    return () => {
      alive = false;
    };
  }, [project.id, project.name, useSupabase]);

  useEffect(() => {
    if (!databaseReady) return undefined;
    setSaveState('Saving…');
    const timer = window.setTimeout(async () => {
      const document = { title, content, links };
      localStorage.setItem(storageKey(project.id), JSON.stringify(document));
      if (useSupabase) {
        const { error } = await supabase.from('project_briefs').upsert({
          project_id: project.id,
          ...document,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id' });
        if (error) {
          console.error('Could not save project brief', error);
          setSaveState('Save failed');
          return;
        }
      }
      setSaveState('Saved');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [content, databaseReady, links, project.id, title, useSupabase, user.id]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (!savedSelectionRef.current) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedSelectionRef.current);
  };

  const runCommand = (command, value = null) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML ?? '');
    rememberSelection();
  };

  const insertEditorLink = () => {
    const url = window.prompt('Paste a link');
    if (url) runCommand('createLink', normaliseUrl(url));
  };

  const insertImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runCommand('insertImage', reader.result);
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const openLinkDialog = (link = null) => {
    setDialog(link);
    setLinkName(link?.name ?? '');
    setLinkUrl(link?.url ?? '');
  };

  const closeDialog = () => {
    setDialog(false);
    setLinkName('');
    setLinkUrl('');
  };

  const saveLink = (event) => {
    event.preventDefault();
    const url = normaliseUrl(linkUrl);
    if (!linkName.trim() || !url) return;
    if (dialog?.id) {
      setLinks((items) => items.map((item) => item.id === dialog.id ? { ...item, name: linkName.trim(), url } : item));
    } else {
      setLinks((items) => [...items, { id: crypto.randomUUID(), name: linkName.trim(), url }]);
    }
    closeDialog();
  };

  return (
    <main className="brief-page">
      <header className="brief-header">
        <div>
          <span className="brief-eyebrow">Briefing document</span>
          <input className="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Brief title" />
        </div>
        <span className="brief-save-state"><Check size={14} /> {saveState}</span>
      </header>

      <div className="brief-workspace">
        <section className="brief-editor-shell">
          <div className="brief-toolbar" aria-label="Formatting toolbar">
            <div className="brief-toolbar-group">
              <ToolbarButton label="Undo" onClick={() => runCommand('undo')}><Undo2 size={17} /></ToolbarButton>
              <ToolbarButton label="Redo" onClick={() => runCommand('redo')}><Redo2 size={17} /></ToolbarButton>
            </div>
            <span className="brief-toolbar-divider" />
            <div className="brief-toolbar-group">
              <label className="brief-font-select-wrap" title="Font family">
                <select
                  className="brief-font-select"
                  defaultValue="Inter"
                  aria-label="Font family"
                  onMouseDown={rememberSelection}
                  onChange={(event) => runCommand('fontName', event.target.value)}
                >
                  {EDITOR_FONTS.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="brief-font-select-wrap brief-size-select-wrap" title="Font size">
                <select
                  className="brief-font-select brief-size-select"
                  defaultValue="3"
                  aria-label="Font size"
                  onMouseDown={rememberSelection}
                  onChange={(event) => runCommand('fontSize', event.target.value)}
                >
                  {EDITOR_FONT_SIZES.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <ToolbarButton label="Heading 1" onClick={() => runCommand('formatBlock', 'h1')}><Heading1 size={18} /></ToolbarButton>
              <ToolbarButton label="Heading 2" onClick={() => runCommand('formatBlock', 'h2')}><Heading2 size={18} /></ToolbarButton>
              <ToolbarButton label="Bold" onClick={() => runCommand('bold')}><Bold size={17} /></ToolbarButton>
              <ToolbarButton label="Italic" onClick={() => runCommand('italic')}><Italic size={17} /></ToolbarButton>
              <ToolbarButton label="Underline" onClick={() => runCommand('underline')}><Underline size={17} /></ToolbarButton>
              <label className="brief-highlight-control" title="Highlight text" onMouseDown={rememberSelection}>
                <Highlighter size={17} />
                <input
                  type="color"
                  defaultValue="#facc15"
                  aria-label="Highlight color"
                  onChange={(event) => runCommand('hiliteColor', event.target.value)}
                />
              </label>
            </div>
            <span className="brief-toolbar-divider" />
            <div className="brief-toolbar-group">
              <ToolbarButton label="Bulleted list" onClick={() => runCommand('insertUnorderedList')}><List size={18} /></ToolbarButton>
              <ToolbarButton label="Numbered list" onClick={() => runCommand('insertOrderedList')}><ListOrdered size={18} /></ToolbarButton>
              <ToolbarButton label="Quote" onClick={() => runCommand('formatBlock', 'blockquote')}><Quote size={17} /></ToolbarButton>
            </div>
            <span className="brief-toolbar-divider" />
            <div className="brief-toolbar-group">
              <ToolbarButton label="Add link" onClick={insertEditorLink}><Link2 size={17} /></ToolbarButton>
              <ToolbarButton label="Add image" onClick={() => imageInputRef.current?.click()}><Image size={17} /></ToolbarButton>
              <input ref={imageInputRef} className="hidden" type="file" accept="image/*" onChange={insertImage} />
            </div>
          </div>
          <div className="brief-paper-wrap">
            <div
              ref={editorRef}
              className="brief-editor"
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: content }}
              onInput={(event) => setContent(event.currentTarget.innerHTML)}
              onKeyUp={rememberSelection}
              onMouseUp={rememberSelection}
              aria-label="Brief document"
            />
          </div>
        </section>

        <aside className="brief-links-panel">
          <div className="brief-links-heading">
            <div>
              <span className="brief-eyebrow">Resources</span>
              <h2>Useful links</h2>
            </div>
            <button type="button" className="brief-add-link" onClick={() => openLinkDialog()}>
              <Plus size={16} /> Add link
            </button>
          </div>
          <p className="brief-links-intro">Keep references, folders and inspiration together with this brief.</p>
          <div className="brief-link-list">
            {links.length === 0 && (
              <button type="button" className="brief-links-empty" onClick={() => openLinkDialog()}>
                <span><Link2 size={20} /></span>
                <strong>Add your first resource</strong>
                <small>Give it a clear name so everyone knows what it is.</small>
              </button>
            )}
            {links.map((link) => (
              <article className="brief-link-card" key={link.id}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  <span className="brief-link-icon"><ExternalLink size={16} /></span>
                  <span><strong>{link.name}</strong><small>{link.url.replace(/^https?:\/\//, '')}</small></span>
                </a>
                <div className="brief-link-actions">
                  <button type="button" onClick={() => openLinkDialog(link)} aria-label={`Rename ${link.name}`}><Pencil size={14} /></button>
                  <button type="button" onClick={() => setLinks((items) => items.filter((item) => item.id !== link.id))} aria-label={`Delete ${link.name}`}><Trash2 size={14} /></button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>

      {dialog !== false && (
        <div className="brief-dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
          <form className="brief-dialog" onSubmit={saveLink} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="brief-eyebrow">Resource</span><h2>{dialog?.id ? 'Edit link' : 'Add a link'}</h2></div>
              <button type="button" onClick={closeDialog} aria-label="Close"><X size={19} /></button>
            </header>
            <label>Name<input autoFocus value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="e.g. Brand guidelines" /></label>
            <label>URL<input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" inputMode="url" /></label>
            <footer>
              <button type="button" className="brief-dialog-cancel" onClick={closeDialog}>Cancel</button>
              <button type="submit" className="brief-dialog-save" disabled={!linkName.trim() || !linkUrl.trim()}>{dialog?.id ? 'Save changes' : 'Add link'}</button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
