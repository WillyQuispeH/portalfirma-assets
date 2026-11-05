// Une clases y descarta las vacías: cx('a', cond && 'b', undefined) -> 'a b'
export const cx = (...clases: (string | false | null | undefined)[]) => clases.filter(Boolean).join(' ');
