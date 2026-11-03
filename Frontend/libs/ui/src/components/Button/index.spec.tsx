import { describe, expect, it } from 'vitest';

import { render } from '../../testing/markup';
import { Button } from './index';

describe('Button', () => {
  it('is busy while loading, its label hidden from sight but still its name (BTN-105)', () => {
    const { markup, styles } = render(<Button loading>送出中</Button>);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('送出中');
    // visibility:hidden would take the label out of the accessibility tree too.
    expect(styles).toContain('opacity:0');
    expect(styles).not.toContain('visibility:hidden');
  });

  it('keeps its hover still while loading', () => {
    const { styles } = render(<Button loading>送出中</Button>);

    expect(styles).toMatch(
      /:hover:not\(:where\(\[aria-busy="true"\]\)\)\{[^}]*translateY\(-2px\)/,
    );
    expect(styles).not.toMatch(/:hover\{[^}]*translateY/);
  });

  it('lets a caller’s own hover win, as the loading check adds no weight', () => {
    const { styles } = render(
      <Button sx={{ '&:hover': { transform: 'translateY(0px)' } }}>
        新增站點
      </Button>,
    );
    const own = styles.indexOf(':hover:not(:where([aria-busy="true"])){');
    const caller = styles.search(/:hover\{[^}]*translateY\(0px\)/);

    // Same weight, so the later rule wins: the caller's.
    expect(own).toBeGreaterThan(-1);
    expect(caller).toBeGreaterThan(own);
  });

  it('neither springs nor lifts for someone who asks for less motion', () => {
    const { styles } = render(<Button>儲存</Button>);

    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\{[^{]*\{[^}]*transition:none;\}[^{]*:hover\{[^}]*transform:none;\}\}/,
    );
  });

  it('keeps a caller’s own aria-busy when it is not loading', () => {
    expect(render(<Button aria-busy>載入中</Button>).markup).toContain(
      'aria-busy="true"',
    );
    expect(render(<Button>儲存</Button>).markup).not.toContain('aria-busy');
  });

  it('says aria-pressed only when selected is given (BTN-107)', () => {
    expect(render(<Button selected>地圖</Button>).markup).toContain(
      'aria-pressed="true"',
    );
    expect(render(<Button selected={false}>地圖</Button>).markup).toContain(
      'aria-pressed="false"',
    );
    expect(render(<Button>地圖</Button>).markup).not.toContain('aria-pressed');
    expect(render(<Button aria-pressed="mixed">全選</Button>).markup).toContain(
      'aria-pressed="mixed"',
    );
  });

  it('shows its count inside, and none for 0 (BTN-110)', () => {
    expect(
      render(
        <Button variant="neutral" count={2}>
          篩選
        </Button>,
      ).markup,
    ).toMatch(/class="[^"]*WgButton-count[^"]*"[^>]*>2</);
    expect(
      render(
        <Button variant="neutral" count={0}>
          篩選
        </Button>,
      ).markup,
    ).not.toContain('WgButton-count');
  });

  it('marks a warning count as one (BTN-110)', () => {
    expect(
      render(
        <Button variant="neutral" count={3} countTone="warning">
          審查
        </Button>,
      ).markup,
    ).toContain('WgButton-count--warning');
  });
});
