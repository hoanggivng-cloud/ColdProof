import { FormatCParser } from './format-c.parser';
describe('FormatCParser', () => {
  it('declares a versioned fixture adapter', () => { expect(new FormatCParser().version).toBe('0.1.0'); });
  it.todo('Extend fixture grammar with explicit format-specific rejection cases');
});
