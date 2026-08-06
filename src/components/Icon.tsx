import circle from '../assets/icons/circle.svg'
import circlefill from '../assets/icons/circlefill.svg'
import color from '../assets/icons/color.svg'
import crop from '../assets/icons/crop.svg'
import curve from '../assets/icons/curve.svg'
import diamond from '../assets/icons/diamond.svg'
import download from '../assets/icons/download.svg'
import lineart from '../assets/icons/lineart.svg'
import moon from '../assets/icons/moon.svg'
import palette from '../assets/icons/palette.svg'
import rose from '../assets/icons/rose.svg'
import smiley from '../assets/icons/smiley.svg'
import spark from '../assets/icons/spark.svg'
import spiral from '../assets/icons/spiral.svg'
import square from '../assets/icons/square.svg'
import squarefill from '../assets/icons/squarefill.svg'
import sun from '../assets/icons/sun.svg'
import upload from '../assets/icons/upload.svg'

const ICONS = {
  circle,
  circlefill,
  color,
  crop,
  curve,
  diamond,
  download,
  lineart,
  moon,
  palette,
  rose,
  smiley,
  spark,
  spiral,
  square,
  squarefill,
  sun,
  upload,
} as const

export type IconName = keyof typeof ICONS

interface IconProps {
  name: IconName
  size?: number
  color?: string
  className?: string
}

/**
 * icon/flatten/*.svg are single-path, single-color assets (fill baked in as
 * #B06026). Rendered via CSS mask instead of <img> so `color` (defaults to
 * currentColor) can recolor them per state, e.g. white on an active tab pill.
 */
export default function Icon({ name, size = 24, color = 'currentColor', className }: IconProps) {
  const url = ICONS[name]
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: color,
        WebkitMaskImage: `url("${url}")`,
        maskImage: `url("${url}")`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  )
}
