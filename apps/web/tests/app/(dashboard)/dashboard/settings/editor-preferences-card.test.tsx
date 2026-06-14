import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorPreferencesCard } from '@/app/(dashboard)/dashboard/settings/editor-preferences-card';

const setFontSize = jest.fn();
const setTheme = jest.fn();
const setScrollSyncEnabled = jest.fn();
const setSoftWrap = jest.fn();
const setPreviewStyle = jest.fn();
const setSpellcheckLanguage = jest.fn();
const setSpellcheckEnabled = jest.fn();

const preferences = {
  fontSize: 14,
  theme: 'default',
  scrollSyncEnabled: false,
  softWrap: true,
  previewStyle: 'asciidocollab',
  spellIgnore: [],
  spellcheckLanguage: 'en',
  spellcheckEnabled: true,
  setFontSize,
  setTheme,
  setScrollSyncEnabled,
  setSoftWrap,
  setPreviewStyle,
  addSpellIgnore: jest.fn(),
  setSpellcheckLanguage,
  setSpellcheckEnabled,
};

jest.mock('@/hooks/use-editor-preferences', () => ({
  useEditorPreferences: () => preferences,
  isSpellcheckLanguageValue: (value: string) =>
    ['en', 'es', 'fr', 'pt', 'de', 'it', 'uk', 'pl', 'tr'].includes(value),
}));

jest.mock('@/components/preview-style-control', () => ({
  PreviewStyleControl: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel: string;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={() => onChange('github')}>
      preview:{value}
    </button>
  ),
}));

describe('EditorPreferencesCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    preferences.fontSize = 14;
    preferences.theme = 'default';
    preferences.scrollSyncEnabled = false;
    preferences.softWrap = true;
  });

  test('renders the font-size select with the current value', () => {
    render(<EditorPreferencesCard />);
    expect(screen.getByLabelText(/font size/i)).toHaveValue('14');
  });

  test('calls setFontSize with a number when the select changes', () => {
    render(<EditorPreferencesCard />);
    fireEvent.change(screen.getByLabelText(/font size/i), { target: { value: '18' } });
    expect(setFontSize).toHaveBeenCalledWith(18);
  });

  test('renders all editor theme options and marks the active one', () => {
    preferences.theme = 'dracula';
    render(<EditorPreferencesCard />);
    for (const label of ['Default', 'High Contrast', 'Dracula', 'Tomorrow', 'Espresso']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Dracula' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('calls setTheme when an editor theme button is clicked', () => {
    render(<EditorPreferencesCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    expect(setTheme).toHaveBeenCalledWith('tomorrow');
  });

  test('wires the preview style control to setPreviewStyle', () => {
    render(<EditorPreferencesCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview style' }));
    expect(setPreviewStyle).toHaveBeenCalledWith('github');
  });

  test('toggles scroll sync', () => {
    render(<EditorPreferencesCard />);
    fireEvent.click(screen.getByLabelText('Scroll Sync'));
    expect(setScrollSyncEnabled).toHaveBeenCalledWith(true);
  });

  test('toggles soft wrap off when currently enabled', () => {
    render(<EditorPreferencesCard />);
    const softWrap = screen.getByLabelText('Soft Wrap');
    expect(softWrap).toBeChecked();
    fireEvent.click(softWrap);
    expect(setSoftWrap).toHaveBeenCalledWith(false);
  });

  test('toggles spell check off', () => {
    render(<EditorPreferencesCard />);
    const toggle = screen.getByLabelText('Spell Check');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(setSpellcheckEnabled).toHaveBeenCalledWith(false);
  });

  test('offers the nine dictionary-backed languages and wires the selector to setSpellcheckLanguage', () => {
    render(<EditorPreferencesCard />);
    const select = screen.getByLabelText('Spell Check Language');
    expect(select.querySelectorAll('option')).toHaveLength(9);
    expect(screen.getByRole('option', { name: 'French' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'fr' } });
    expect(setSpellcheckLanguage).toHaveBeenCalledWith('fr');
  });

  test('disables the language selector when spell check is off', () => {
    preferences.spellcheckEnabled = false;
    render(<EditorPreferencesCard />);
    expect(screen.getByLabelText('Spell Check Language')).toBeDisabled();
    preferences.spellcheckEnabled = true; // restore for other tests
  });
});
