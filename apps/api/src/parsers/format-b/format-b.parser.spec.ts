import { FormatBParser } from './format-b.parser';
describe('FormatBParser', () => {
  it('declares a versioned fixture adapter', () => { expect(new FormatBParser().version).toBe('0.1.0'); });
  it.todo('Extend fixture grammar with explicit format-specific rejection cases');
});
