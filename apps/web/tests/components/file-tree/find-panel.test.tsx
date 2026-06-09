import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FindPanel } from '@/components/file-tree/find-panel';

describe('FindPanel', () => {
  const defaultProps = {
    query: '',
    onQueryChange: jest.fn(),
    matchCount: 0,
    currentMatchIndex: -1,
    onNext: jest.fn(),
    onPrev: jest.fn(),
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders search input', () => {
    render(<FindPanel {...defaultProps} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('typing in search input calls onQueryChange', () => {
    const onQueryChange = jest.fn();
    render(<FindPanel {...defaultProps} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'alpha' } });
    expect(onQueryChange).toHaveBeenCalledWith('alpha');
  });

  it('renders up (prev) and down (next) navigation buttons', () => {
    render(<FindPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /previous match/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next match/i })).toBeInTheDocument();
  });

  it('clicking next match button fires onNext', () => {
    const onNext = jest.fn();
    render(<FindPanel {...defaultProps} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: /next match/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it('pressing Enter in the input fires onNext, other keys do not', () => {
    const onNext = jest.fn();
    render(<FindPanel {...defaultProps} onNext={onNext} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'a' });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('clicking prev match button fires onPrev', () => {
    const onPrevious = jest.fn();
    render(<FindPanel {...defaultProps} onPrev={onPrevious} />);
    fireEvent.click(screen.getByRole('button', { name: /previous match/i }));
    expect(onPrevious).toHaveBeenCalled();
  });

  it('displays match counter as "n of m" when there are matches', () => {
    render(<FindPanel {...defaultProps} matchCount={5} currentMatchIndex={2} />);
    expect(screen.getByText(/3\s*of\s*5/i)).toBeInTheDocument();
  });

  it('displays "no matches" indicator when matchCount is 0 and query is non-empty', () => {
    render(<FindPanel {...defaultProps} query="xyzzy" matchCount={0} currentMatchIndex={-1} />);
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it('renders dismiss button', () => {
    render(<FindPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('pressing Enter in the input fires onNext', () => {
    const onNext = jest.fn();
    render(<FindPanel {...defaultProps} onNext={onNext} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('clicking dismiss button fires onDismiss', () => {
    const onDismiss = jest.fn();
    render(<FindPanel {...defaultProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
