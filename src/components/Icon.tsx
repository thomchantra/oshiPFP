import bear from '../assets/icons/bear.svg'
import check from '../assets/icons/check.svg'
import circle from '../assets/icons/circle.svg'
import circlefill from '../assets/icons/circlefill.svg'
import color from '../assets/icons/color.svg'
import crop from '../assets/icons/crop.svg'
import cross from '../assets/icons/cross.svg'
import curve from '../assets/icons/curve.svg'
import diamond from '../assets/icons/diamond.svg'
import download from '../assets/icons/download.svg'
import dualpane from '../assets/icons/dualpane.svg'
import eyedropper from '../assets/icons/eyedropper.svg'
import flask from '../assets/icons/flask.svg'
import lineart from '../assets/icons/lineart.svg'
import moon from '../assets/icons/moon.svg'
import nerd from '../assets/icons/nerd.svg'
import palette from '../assets/icons/palette.svg'
import question from '../assets/icons/question.svg'
import refresh from '../assets/icons/refresh.svg'
import rose from '../assets/icons/rose.svg'
import slider from '../assets/icons/slider.svg'
import smiley from '../assets/icons/smiley.svg'
import spark from '../assets/icons/spark.svg'
import spiral from '../assets/icons/spiral.svg'
import square from '../assets/icons/square.svg'
import squarefill from '../assets/icons/squarefill.svg'
import sun from '../assets/icons/sun.svg'
import upload from '../assets/icons/upload.svg'

const ICONS = {
  bear,
  check,
  circle,
  circlefill,
  color,
  crop,
  cross,
  curve,
  diamond,
  download,
  dualpane,
  eyedropper,
  flask,
  lineart,
  moon,
  nerd,
  palette,
  question,
  refresh,
  rose,
  slider,
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
