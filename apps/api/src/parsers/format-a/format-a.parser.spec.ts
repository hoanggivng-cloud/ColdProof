import { FormatAParser } from './format-a.parser';
describe('FormatAParser', () => {
  it('declares a versioned fixture adapter', () => { expect(new FormatAParser().version).toBe('0.1.0'); });
  it.todo('Extend fixture grammar with explicit format-specific rejection cases');
});
