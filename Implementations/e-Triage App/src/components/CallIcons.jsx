import styles from './CallIcons.module.css';

const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function PhoneIcon() {
  return (
    <span className={styles.iconWhite} aria-hidden>
      <svg xmlns="http://www.w3.org/2000/svg" {...iconProps}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    </span>
  );
}

export function LaptopIcon() {
  return (
    <span className={styles.iconWhite} aria-hidden>
      <svg xmlns="http://www.w3.org/2000/svg" {...iconProps}>
        <rect x="2" y="4" width="20" height="15" rx="2" ry="2" />
        <line x1="6" y1="20" x2="18" y2="20" />
        <line x1="6" y1="16" x2="6.01" y2="16" />
        <line x1="10" y1="16" x2="10.01" y2="16" />
        <line x1="14" y1="16" x2="14.01" y2="16" />
        <line x1="18" y1="16" x2="18.01" y2="16" />
      </svg>
    </span>
  );
}
