/**
 * Made with 💛 by Karim Saif
 * @framerIntrinsicWidth 1000
 * @framerIntrinsicHeight 650
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */

"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
    addPropertyControls,
    ControlType,
    useIsStaticRenderer,
    useReducedMotion,
} from "framer"

type Props = {
    text: string
    color: string
    accentColor: string
    backgroundColor: string
    size: number
    speed: number
    paused: boolean
    interactive: boolean
    pointerRadius: number
    pointerStrength: number
    arrowThickness: number
    letterScale: number
    holdDuration: number
    sweepDelay: number
    style?: React.CSSProperties
}

type Cell = { x: number; y: number; diagonal: number }
type RGB = { r: number; g: number; b: number }

const FONT: Record<string, string> = {
    A: "0e11111f111111", B: "1e11111e11111e", C: "0e11101010110e",
    D: "1e11111111111e", E: "1f10101e10101f", F: "1f10101e101010",
    G: "0e11101711110f", H: "1111111f111111", I: "0e04040404040e",
    J: "0702020202120c", K: "11121418141211", L: "1010101010101f",
    M: "111b1515111111", N: "11111915131111", O: "0e11111111110e",
    P: "1e11111e101010", Q: "0e11111115120d", R: "1e11111e141211",
    S: "0f10100e01011e", T: "1f040404040404", U: "1111111111110e",
    V: "11111111110a04", W: "1111111515150a", X: "11110a040a1111",
    Y: "11110a04040404", Z: "1f01020408101f", 0: "0e11131519110e",
    1: "040c040404040e", 2: "0e11010204081f", 3: "1f02040201110e",
    4: "02060a121f0202", 5: "1f101e0101110e", 6: "0608101e11110e",
    7: "1f010204080808", 8: "0e11110e11110e", 9: "0e11110f01020c",
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const finite = (v: number, fallback: number) => Number.isFinite(v) ? v : fallback

function glyphPixel(character: string, x: number, y: number): boolean {
    const glyph = FONT[character]
    if (!glyph || x < 0 || x > 4 || y < 0 || y > 6) return false
    return ((parseInt(glyph.slice(y * 2, y * 2 + 2), 16) >> (4 - x)) & 1) === 1
}

function blendAngle(a: number, b: number, amount: number) {
    return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * clamp(amount, 0, 1)
}

function parseColor(value: string): RGB {
    const fallback = { r: 255, g: 255, b: 255 }
    if (!value || typeof value !== "string") return fallback
    const hex = value.trim().replace("#", "")
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) }
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) }
    }
    const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i)
    if (rgb) return { r: clamp(Number(rgb[1]), 0, 255), g: clamp(Number(rgb[2]), 0, 255), b: clamp(Number(rgb[3]), 0, 255) }
    return fallback
}

function mixColor(a: RGB, b: RGB, t: number) {
    const w = clamp(t, 0, 1)
    return `rgb(${Math.round(a.r + (b.r - a.r) * w)},${Math.round(a.g + (b.g - a.g) * w)},${Math.round(a.b + (b.b - a.b) * w)})`
}

function getCharacters(text: string) {
    const chars = Array.from(String(text || "").toUpperCase()).filter(c => Boolean(FONT[c]))
    return chars.length ? chars : ["R"]
}

function getLayout(columns: number, rows: number, letterScale: number) {
    const fraction = clamp(letterScale / 100, 0.2, 1)
    const scale = Math.max(0.1, Math.min((columns * fraction) / 5, (rows * fraction) / 7))
    return { scale, left: (columns - 5 * scale) / 2, top: (rows - 7 * scale) / 2 }
}

function createMask(character: string, columns: number, rows: number, letterScale: number) {
    const mask = new Uint8Array(columns * rows)
    const layout = getLayout(columns, rows, letterScale)
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
            const x = Math.floor((i - layout.left) / layout.scale)
            const y = Math.floor((j - layout.top) / layout.scale)
            mask[j * columns + i] = glyphPixel(character, x, y) ? 1 : 0
        }
    }
    return mask
}

function arrowPath(x: number, y: number, cell: number, angle: number) {
    const shaft = cell * 0.3 * Math.SQRT2
    const head = cell * 0.22
    const tipX = x + Math.cos(angle) * shaft
    const tipY = y + Math.sin(angle) * shaft
    const back = angle + Math.PI
    return `M ${x - Math.cos(angle) * shaft} ${y - Math.sin(angle) * shaft} L ${tipX} ${tipY} M ${tipX + Math.cos(back - Math.PI / 4) * head} ${tipY + Math.sin(back - Math.PI / 4) * head} L ${tipX} ${tipY} L ${tipX + Math.cos(back + Math.PI / 4) * head} ${tipY + Math.sin(back + Math.PI / 4) * head}`
}

function StaticArrowGrid({ width, height, text, color, accentColor, size, letterScale, arrowThickness }: {
    width: number; height: number; text: string; color: string; accentColor: string; size: number; letterScale: number; arrowThickness: number
}) {
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    const cell = clamp(size, 10, 100)
    const columns = Math.ceil(w / cell)
    const rows = Math.ceil(h / cell)
    const mask = createMask(getCharacters(text)[0], columns, rows, letterScale)
    const plain: string[] = []
    const accent: string[] = []
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
            const path = arrowPath((i + 0.5) * cell, (j + 0.5) * cell, cell, Math.PI / 4)
            ;(mask[j * columns + i] ? accent : plain).push(path)
        }
    }
    const strokeWidth = Math.max(1, (cell * arrowThickness) / 100)
    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"
            style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}>
            <path d={plain.join(" ")} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" />
            <path d={accent.join(" ")} fill="none" stroke={accentColor} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
    )
}

export default function KarimSaifArrowLetterBackground(props: Props) {
    const {
        text = "PIXEL", color = "#FFFFFF", accentColor = "#E3171E", backgroundColor = "#231F20",
        size = 22, speed = 1, paused = false, interactive = true, pointerRadius = 18,
        pointerStrength = 90, arrowThickness = 12, letterScale = 74, holdDuration = 2.4,
        sweepDelay = 0.022, style,
    } = props
    const hostRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const staticMode = useIsStaticRenderer() || useReducedMotion() === true
    const [dimensions, setDimensions] = useState({ width: 1000, height: 650 })
    const characters = useMemo(() => getCharacters(text), [text])
    const plainRGB = useMemo(() => parseColor(color), [color])
    const accentRGB = useMemo(() => parseColor(accentColor), [accentColor])

    useEffect(() => {
        const host = hostRef.current
        if (!host) return
        const resize = () => {
            const rect = host.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            setDimensions(previous =>
                Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
                    ? previous : { width: rect.width, height: rect.height }
            )
        }
        resize()
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", resize)
            return () => window.removeEventListener("resize", resize)
        }
        const observer = new ResizeObserver(resize)
        observer.observe(host)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (staticMode) return
        const host = hostRef.current
        const canvas = canvasRef.current
        if (!host || !canvas) return
        const ctx = canvas.getContext("2d", { alpha: true })
        if (!ctx) return

        const cell = clamp(finite(size, 22), 10, 100)
        const rate = clamp(finite(speed, 1), 0, 5)
        const hold = clamp(finite(holdDuration, 2.4), 0.5, 10)
        const delay = clamp(finite(sweepDelay, 0.022), 0, 0.15)
        const thickness = clamp(finite(arrowThickness, 12), 4, 30)
        let width = 0, height = 0, columns = 0, rows = 0
        let cells: Cell[] = []
        let masks: Uint8Array[] = []
        let mix = new Float32Array(0)
        let elapsed = 0, frame = 0, previous = 0
        let visible = true, disposed = false, initialized = false
        const pointer = { x: 0, y: 0, strength: 0, target: 0 }
        const getCurrentIndex = () => Math.floor(elapsed / hold)

        const buildGrid = () => {
            columns = Math.ceil(width / cell)
            rows = Math.ceil(height / cell)
            const totalDiagonal = Math.max(1, columns + rows - 2)
            cells = []
            for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
                cells.push({ x: (i + 0.5) * cell, y: (j + 0.5) * cell, diagonal: (i + j) / totalDiagonal })
            }
            masks = characters.map(c => createMask(c, columns, rows, letterScale))
            mix = new Float32Array(cells.length)
            mix.set(masks[getCurrentIndex() % characters.length])
            initialized = true
        }

        const draw = (delta: number) => {
            if (disposed || !initialized || width <= 0 || height <= 0) return
            ctx.clearRect(0, 0, width, height)
            const cycle = getCurrentIndex()
            const characterIndex = cycle % characters.length
            const currentMask = masks[characterIndex]
            const previousMask = masks[(characterIndex - 1 + masks.length) % masks.length]
            const since = elapsed - cycle * hold
            const maximumSweep = Math.min(hold * 0.7, Math.max(0, delay * (columns + rows - 2)))
            const transitionTime = Math.max(0.001, Math.min(0.35, hold - maximumSweep))
            const pointerEase = 1 - Math.pow(0.92, delta * 60)
            pointer.strength += (pointer.target - pointer.strength) * pointerEase
            const radius = (Math.min(width, height) * clamp(pointerRadius, 5, 60)) / 100
            const radiusSquared = Math.max(1, radius * radius)
            ctx.lineWidth = Math.max(1, (cell * thickness) / 100)
            ctx.lineCap = "square"
            ctx.lineJoin = "miter"
            const baseAngle = Math.PI / 4
            const shaft = cell * 0.3 * Math.SQRT2
            const head = cell * 0.22
            const colorSteps = 24
            const paths = Array.from({ length: colorSteps + 1 }, () => new Path2D())

            for (let k = 0; k < cells.length; k++) {
                const item = cells[k]
                const start = item.diagonal * maximumSweep
                const target = currentMask[k]
                if (since >= start) {
                    const progress = clamp((since - start) / transitionTime, 0, 1)
                    const eased = progress * progress * (3 - 2 * progress)
                    const previousValue = cycle === 0 ? currentMask[k] : previousMask[k]
                    mix[k] = previousValue + (target - previousValue) * eased
                }
                const m = clamp(mix[k], 0, 1)
                let angle = baseAngle
                if (interactive && pointer.strength > 0.001) {
                    const dx = pointer.x - item.x, dy = pointer.y - item.y
                    const influence = Math.exp(-(dx * dx + dy * dy) / radiusSquared) *
                        pointer.strength * clamp(pointerStrength / 100, 0, 1)
                    angle = blendAngle(baseAngle, Math.atan2(dy, dx), influence)
                }
                const squash = 1 - 0.45 * Math.sin(Math.PI * m)
                const dx = Math.cos(angle) * shaft * squash
                const dy = Math.sin(angle) * shaft * squash
                const tipX = item.x + dx, tipY = item.y + dy
                const path = paths[Math.round(m * colorSteps)]
                path.moveTo(item.x - dx, item.y - dy)
                path.lineTo(tipX, tipY)
                const back = angle + Math.PI
                const scaledHead = head * squash
                path.moveTo(tipX + Math.cos(back - Math.PI / 4) * scaledHead, tipY + Math.sin(back - Math.PI / 4) * scaledHead)
                path.lineTo(tipX, tipY)
                path.lineTo(tipX + Math.cos(back + Math.PI / 4) * scaledHead, tipY + Math.sin(back + Math.PI / 4) * scaledHead)
            }
            for (let i = 0; i <= colorSteps; i++) {
                ctx.strokeStyle = mixColor(plainRGB, accentRGB, i / colorSteps)
                ctx.stroke(paths[i])
            }
        }

        const stop = () => {
            if (frame) { cancelAnimationFrame(frame); frame = 0 }
        }
        const tick = (now: number) => {
            frame = 0
            if (disposed || paused || rate <= 0 || !visible || document.hidden) return
            const delta = clamp((now - previous) / 1000, 0, 0.05)
            previous = now
            elapsed += delta * rate
            draw(delta)
            frame = requestAnimationFrame(tick)
        }
        const update = () => {
            if (disposed) return
            stop()
            if (!paused && rate > 0 && visible && !document.hidden) {
                previous = performance.now()
                frame = requestAnimationFrame(tick)
            } else {
                draw(0)
            }
        }
        const resize = () => {
            if (disposed) return
            const rect = host.getBoundingClientRect()
            const nextWidth = Math.max(0, rect.width), nextHeight = Math.max(0, rect.height)
            if (!nextWidth || !nextHeight) return
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            const pw = Math.max(1, Math.round(nextWidth * dpr))
            const ph = Math.max(1, Math.round(nextHeight * dpr))
            if (canvas.width === pw && canvas.height === ph && initialized) return
            width = nextWidth
            height = nextHeight
            canvas.width = pw
            canvas.height = ph
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            buildGrid()
            draw(0)
        }
        const move = (event: PointerEvent) => {
            if (!interactive || paused || rate <= 0) return
            const rect = host.getBoundingClientRect()
            pointer.x = event.clientX - rect.left
            pointer.y = event.clientY - rect.top
            pointer.target = 1
        }
        const leave = () => { pointer.target = 0 }
        const onVisibility = () => update()
        let resizeObserver: ResizeObserver | null = null
        let intersectionObserver: IntersectionObserver | null = null

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(resize)
            resizeObserver.observe(host)
        }
        if (typeof IntersectionObserver !== "undefined") {
            visible = false
            intersectionObserver = new IntersectionObserver(([entry]) => {
                visible = entry?.isIntersecting ?? false
                update()
            }, { threshold: 0.01 })
            intersectionObserver.observe(host)
        }
        resize()
        host.addEventListener("pointermove", move, { passive: true })
        host.addEventListener("pointerleave", leave)
        host.addEventListener("pointercancel", leave)
        document.addEventListener("visibilitychange", onVisibility)
        update()
        return () => {
            disposed = true
            stop()
            resizeObserver?.disconnect()
            intersectionObserver?.disconnect()
            host.removeEventListener("pointermove", move)
            host.removeEventListener("pointerleave", leave)
            host.removeEventListener("pointercancel", leave)
            document.removeEventListener("visibilitychange", onVisibility)
        }
    }, [
        staticMode, characters, plainRGB, accentRGB, size, speed, paused,
        interactive, pointerRadius, pointerStrength, arrowThickness,
        letterScale, holdDuration, sweepDelay,
    ])

    return (
        <div ref={hostRef} role="img" aria-label={`Arrow grid displaying ${text}`}
            style={{
                width: "100%", height: "100%", minWidth: 0, minHeight: 0,
                position: "relative", overflow: "hidden", isolation: "isolate",
                backgroundColor, ...style,
            }}>
            {staticMode ? (
                <StaticArrowGrid width={dimensions.width} height={dimensions.height}
                    text={text} color={color} accentColor={accentColor}
                    size={size} letterScale={letterScale} arrowThickness={arrowThickness} />
            ) : (
                <canvas ref={canvasRef} aria-hidden="true"
                    style={{
                        position: "absolute", inset: 0, display: "block",
                        width: "100%", height: "100%", pointerEvents: "none",
                    }} />
            )}
        </div>
    )
}

addPropertyControls(KarimSaifArrowLetterBackground, {
    text: { type: ControlType.String, title: "Text", defaultValue: "PIXEL",
        description: "Enter a sequence of letters or numbers to display one character at a time. Supports A–Z and 0–9." },
    color: { type: ControlType.Color, title: "Arrow Color", defaultValue: "#FFFFFF",
        description: "Sets the color of the regular arrows across the background grid." },
    accentColor: { type: ControlType.Color, title: "Letter Color", defaultValue: "#E3171E",
        description: "Sets the highlight color used by arrows forming each animated letter." },
    backgroundColor: { type: ControlType.Color, title: "Background", defaultValue: "#231F20",
        description: "Sets the background color behind the animated arrow field." },
    size: { type: ControlType.Number, title: "Grid Size", defaultValue: 22, min: 10, max: 100, step: 1, unit: "px", displayStepper: true,
        description: "Adjusts the spacing and scale of the arrows. Smaller values create a denser grid." },
    speed: { type: ControlType.Number, title: "Speed", defaultValue: 1, min: 0, max: 5, step: 0.1, displayStepper: true,
        description: "Controls the playback speed of the letter animation. Zero stops the animation." },
    paused: { type: ControlType.Boolean, title: "Paused", defaultValue: false, enabledTitle: "Yes", disabledTitle: "No",
        description: "Freezes the animation at its current frame without resetting the letter sequence." },
    letterScale: { type: ControlType.Number, title: "Letter Scale", defaultValue: 74, min: 20, max: 100, step: 1, unit: "%", displayStepper: true,
        description: "Adjusts the letter size while fitting the glyph inside both the available width and height." },
    holdDuration: { type: ControlType.Number, title: "Letter Hold", defaultValue: 2.4, min: 0.5, max: 10, step: 0.1, unit: "s", displayStepper: true,
        description: "Sets the duration of each character in the sequence, including its directional transition." },
    sweepDelay: { type: ControlType.Number, title: "Sweep Delay", defaultValue: 0.022, min: 0, max: 0.15, step: 0.001, displayStepper: true,
        description: "Controls the diagonal delay between arrows. The sweep automatically fits within the letter duration." },
    arrowThickness: { type: ControlType.Number, title: "Thickness", defaultValue: 12, min: 4, max: 30, step: 1, unit: "%", displayStepper: true,
        description: "Adjusts the stroke thickness of arrow shafts and arrowheads relative to the grid cell size." },
    interactive: { type: ControlType.Boolean, title: "Interactive", defaultValue: true, enabledTitle: "On", disabledTitle: "Off",
        description: "Enables pointer interaction so nearby arrows rotate toward the cursor." },
    pointerRadius: { type: ControlType.Number, title: "Cursor Radius", defaultValue: 18, min: 5, max: 60, step: 1, unit: "%", displayStepper: true,
        hidden: (props) => !props.interactive,
        description: "Controls the distance around the cursor affected by arrow rotation." },
    pointerStrength: { type: ControlType.Number, title: "Cursor Force", defaultValue: 90, min: 0, max: 100, step: 1, unit: "%", displayStepper: true,
        hidden: (props) => !props.interactive,
        description: "Controls how strongly nearby arrows turn toward the pointer." },
})
