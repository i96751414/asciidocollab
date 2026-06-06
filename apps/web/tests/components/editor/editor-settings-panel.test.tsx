import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorSettingsPanel } from '@/components/editor/editor-settings-panel';

let capturedOnValueChange: ((v: string) => void) | undefined;

jest.mock('@radix-ui/react-select', () => ({
  Root: ({ children, value, onValueChange }: { children: React.ReactNode; onValueChange?: (v: string) => void; value: string }) => {
    capturedOnValueChange = onValueChange;
    return <div data-testid="select-root" data-value={value}>{children}</div>;
  },
  Trigger: ({ children }: { children: React.ReactNode }) =>
    <button data-testid="select-trigger">{children}</button>,
  Value: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Content: ({ children }: { children: React.ReactNode }) => <div data-testid="select-content">{children}</div>,
  Item: ({ children, value }: { children: React.ReactNode; value: string }) =>
    <button onClick={() => capturedOnValueChange?.(value)} data-value={value} data-testid={`select-item-${value}`}>{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Icon: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Viewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ItemText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ItemIndicator: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe('EditorSettingsPanel', () => {
  const mockSetFontSize = jest.fn();
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    mockSetFontSize.mockReset();
    mockSetTheme.mockReset();
  });

  test('renders font size stepper showing current value', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    expect(screen.getByDisplayValue('14')).toBeInTheDocument();
  });

  test('incrementing calls setFontSize with +1', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /increase|increment|\+/i }));
    expect(mockSetFontSize).toHaveBeenCalledWith(15);
  });

  test('decrementing calls setFontSize with -1', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /decrease|decrement|-/i }));
    expect(mockSetFontSize).toHaveBeenCalledWith(13);
  });

  test('theme select renders both theme options', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    expect(screen.getByText(/default/i)).toBeInTheDocument();
    expect(screen.getByText(/high.contrast/i)).toBeInTheDocument();
  });

  test('all controls are keyboard-accessible', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    const controls = screen.getAllByRole('button');
    for (const ctrl of controls) {
      expect(ctrl).not.toHaveAttribute('tabindex', '-1');
    }
  });

  test('onChange on font size input calls setFontSize for a valid value', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '18' } });
    expect(mockSetFontSize).toHaveBeenCalledWith(18);
  });

  test('onChange on font size input does not call setFontSize for an out-of-range value', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
    expect(mockSetFontSize).not.toHaveBeenCalled();
  });

  test('selecting a valid theme calls setTheme', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    fireEvent.click(screen.getByTestId('select-item-dracula'));
    expect(mockSetTheme).toHaveBeenCalledWith('dracula');
  });

  test('selecting an invalid theme value does not call setTheme', () => {
    render(
      <EditorSettingsPanel
        fontSize={14}
        theme="default"
        setFontSize={mockSetFontSize}
        setTheme={mockSetTheme}
      />
    );
    capturedOnValueChange?.('not-a-valid-theme');
    expect(mockSetTheme).not.toHaveBeenCalled();
  });
});
