/* Dev-only React shim for src/client.js. Not part of the plugin bundle. */
(function () {
  const SVG = new Set(['svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'g', 'polyline', 'polygon'])
  const ATTR = {
    className: 'class',
    viewBox: 'viewBox',
    preserveAspectRatio: 'preserveAspectRatio',
    strokeWidth: 'stroke-width',
    strokeLinecap: 'stroke-linecap',
    strokeLinejoin: 'stroke-linejoin',
    fillRule: 'fill-rule',
  }
  const SKIP = new Set(['children', 'key', 'ref', 'style', 'className', 'disabled', 'checked', 'selected'])

  function flatten(nodes, out) {
    for (const node of nodes) {
      if (node == null || node === false || node === true) continue
      if (Array.isArray(node)) flatten(node, out)
      else if (typeof node === 'string' || typeof node === 'number') {
        out.push({ type: '#text', props: {}, children: [], text: String(node), key: null })
      } else out.push(node)
    }
    return out
  }

  function h(type, props, ...rest) {
    const propsOut = {}
    let key = null
    if (props) {
      for (const name of Object.keys(props)) {
        if (name === 'key') key = props.key
        else if (name !== 'children') propsOut[name] = props[name]
      }
      if (props.children != null) rest = rest.concat([props.children])
    }
    return { type, props: propsOut, children: flatten(rest, []), key, fiber: null, dom: null, child: null }
  }

  let wip = null
  let hookIndex = 0
  let scheduled = false
  let scheduledRoot = null

  function useState(init) {
    const fiber = wip
    const index = hookIndex++
    if (fiber.hooks.length <= index) {
      fiber.hooks.push({ state: typeof init === 'function' ? init() : init })
    }
    const slot = fiber.hooks[index]
    const setState = (value) => {
      const next = typeof value === 'function' ? value(slot.state) : value
      if (Object.is(next, slot.state)) return
      slot.state = next
      schedule(fiber.root)
    }
    return [slot.state, setState]
  }

  function useEffect(fn, deps) {
    const fiber = wip
    const index = hookIndex++
    const prev = fiber.hooks[index]
    const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((dep, i) => !Object.is(dep, prev.deps[i]))
    fiber.hooks[index] = { deps, fn, cleanup: prev ? prev.cleanup : undefined }
    if (changed) fiber.effects.push(index)
  }

  function schedule(root) {
    scheduledRoot = root
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (scheduledRoot) flush(scheduledRoot)
    })
  }

  function runEffects(fiber) {
    const indexes = fiber.effects.splice(0)
    for (const index of indexes) {
      const slot = fiber.hooks[index]
      if (!slot) continue
      if (typeof slot.cleanup === 'function') slot.cleanup()
      const cleanup = slot.fn()
      slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  }

  function cleanupFiber(fiber) {
    if (!fiber) return
    for (const slot of fiber.hooks) {
      if (slot && typeof slot.cleanup === 'function') {
        slot.cleanup()
        slot.cleanup = undefined
      }
    }
  }

  function unmount(vnode) {
    if (!vnode) return
    if (typeof vnode.type === 'function') {
      cleanupFiber(vnode.fiber)
      unmount(vnode.child)
      return
    }
    if (vnode.children) for (const child of vnode.children) unmount(child)
    if (vnode.dom && vnode.dom.parentNode) vnode.dom.parentNode.removeChild(vnode.dom)
  }

  function attrName(name) {
    if (ATTR[name]) return ATTR[name]
    return name
  }

  function bindEvents(dom) {
    const call = (name, event) => {
      const fn = dom.__props && dom.__props[name]
      if (typeof fn === 'function') fn(event)
    }
    dom.addEventListener('click', (event) => call('onClick', event))
    dom.addEventListener('dblclick', (event) => call('onDoubleClick', event))
    dom.addEventListener('input', (event) => {
      if (dom.tagName === 'SELECT' || dom.type === 'checkbox' || dom.type === 'radio') return
      call('onChange', event)
    })
    dom.addEventListener('change', (event) => {
      if (dom.tagName === 'SELECT' || dom.type === 'checkbox' || dom.type === 'radio') call('onChange', event)
    })
    dom.addEventListener('submit', (event) => call('onSubmit', event))
    dom.addEventListener('keydown', (event) => call('onKeyDown', event))
  }

  function applyProps(dom, props) {
    dom.__props = props || {}
    const names = new Set(Object.keys(props || {}))
    if (dom.__propNames) {
      for (const name of dom.__propNames) {
        if (names.has(name) || SKIP.has(name) || name.startsWith('on')) continue
        dom.removeAttribute(attrName(name))
      }
    }
    dom.__propNames = names
    if (!props) return
    if (props.className != null && props.className !== false) dom.setAttribute('class', props.className)
    else dom.removeAttribute('class')
    dom.removeAttribute('style')
    if (props.style && typeof props.style === 'object') {
      for (const [key, value] of Object.entries(props.style)) {
        const css = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())
        if (value != null) dom.style.setProperty(css, String(value))
      }
    }
    for (const [key, value] of Object.entries(props)) {
      if (SKIP.has(key) || key.startsWith('on')) continue
      if (key === 'value' && (dom.tagName === 'INPUT' || dom.tagName === 'TEXTAREA' || dom.tagName === 'SELECT')) continue
      if (value == null || value === false) dom.removeAttribute(attrName(key))
      else dom.setAttribute(attrName(key), value === true ? '' : String(value))
    }
    if ('disabled' in props) dom.disabled = !!props.disabled
    if ('checked' in props && dom.tagName === 'INPUT') dom.checked = !!props.checked
  }

  function placeValue(dom, props) {
    if (!props || !('value' in props)) return
    if (dom.tagName !== 'INPUT' && dom.tagName !== 'TEXTAREA' && dom.tagName !== 'SELECT') return
    const next = props.value == null ? '' : String(props.value)
    if (dom.value !== next) dom.value = next
  }

  function reconcile(parentDom, oldVNode, newVNode, root) {
    if (newVNode == null) {
      if (oldVNode) unmount(oldVNode)
      return null
    }
    if (typeof newVNode.type === 'function') return reconcileComponent(parentDom, oldVNode, newVNode, root)
    return reconcileHost(parentDom, oldVNode, newVNode, root)
  }

  function reconcileComponent(parentDom, oldVNode, newVNode, root) {
    const same = oldVNode && oldVNode.type === newVNode.type
    if (oldVNode && !same) {
      unmount(oldVNode)
      oldVNode = null
    }
    const fiber = same && oldVNode.fiber ? oldVNode.fiber : { hooks: [], effects: [], root }
    fiber.root = root
    fiber.effects = []
    newVNode.fiber = fiber
    const prevWip = wip
    const prevHook = hookIndex
    wip = fiber
    hookIndex = 0
    const rendered = newVNode.type(newVNode.props || {})
    wip = prevWip
    hookIndex = prevHook
    const child = rendered == null || rendered === false ? null : rendered
    newVNode.child = reconcile(parentDom, oldVNode ? oldVNode.child : null, child, root)
    newVNode.dom = newVNode.child ? newVNode.child.dom : null
    if (fiber.effects.length) root.pendingEffects.push(fiber)
    return newVNode
  }

  function reconcileHost(parentDom, oldVNode, newVNode, root) {
    if (newVNode.type === '#text') {
      if (oldVNode && oldVNode.type === '#text' && oldVNode.dom) {
        if (oldVNode.dom.nodeValue !== newVNode.text) oldVNode.dom.nodeValue = newVNode.text
        newVNode.dom = oldVNode.dom
        return newVNode
      }
      if (oldVNode) unmount(oldVNode)
      const dom = document.createTextNode(newVNode.text)
      newVNode.dom = dom
      parentDom.appendChild(dom)
      return newVNode
    }
    const reuse = oldVNode && oldVNode.type === newVNode.type && oldVNode.dom
    let dom
    if (reuse) {
      dom = oldVNode.dom
      newVNode.dom = dom
    } else {
      if (oldVNode) unmount(oldVNode)
      dom = SVG.has(newVNode.type)
        ? document.createElementNS('http://www.w3.org/2000/svg', newVNode.type)
        : document.createElement(newVNode.type)
      newVNode.dom = dom
      bindEvents(dom)
      parentDom.appendChild(dom)
    }
    applyProps(dom, newVNode.props)
    diffChildren(dom, reuse ? oldVNode.children : null, newVNode.children, root)
    placeValue(dom, newVNode.props)
    return newVNode
  }

  function diffChildren(parentDom, oldChildren, newChildren, root) {
    const previous = oldChildren || []
    const keyed = new Map()
    for (const child of previous) {
      if (child && child.key != null) keyed.set(child.key, child)
    }
    const used = new Set()
    const placed = []
    let cursor = 0
    for (const child of newChildren) {
      let old = null
      if (child.key != null && keyed.has(child.key)) old = keyed.get(child.key)
      else if (child.key == null) {
        while (cursor < previous.length) {
          const candidate = previous[cursor++]
          if (!candidate || candidate.key != null || used.has(candidate)) continue
          old = candidate
          break
        }
      }
      if (old) used.add(old)
      const vnode = reconcile(parentDom, old, child, root)
      if (vnode && vnode.dom) placed.push(vnode)
    }
    for (const child of previous) {
      if (child && !used.has(child)) unmount(child)
    }
    for (let index = 0; index < placed.length; index++) {
      const dom = placed[index].dom
      if (!dom || dom.parentNode !== parentDom) continue
      const current = parentDom.childNodes[index]
      if (current !== dom) parentDom.insertBefore(dom, current || null)
    }
  }

  function flush(root) {
    root.pendingEffects = []
    root.vnode = reconcile(root.container, root.vnode, root.element, root)
    const effects = root.pendingEffects.slice()
    queueMicrotask(() => {
      for (const fiber of effects) runEffects(fiber)
    })
  }

  function render(element, container) {
    let root = container.__nbRoot
    if (!root) {
      root = { container, vnode: null, element: null, pendingEffects: [] }
      container.__nbRoot = root
    }
    root.element = element
    flush(root)
  }

  window.React = { createElement: h, useState, useEffect }
  window.ReactDOM = { render }
  window.__plugins = []
  window.__ModuleLoader__ = {
    load(def) {
      const plugin = def.factory(function require(id) {
        if (id === 'react') return window.React
        throw new Error('Cannot find module ' + id)
      })
      window.__plugins.push(plugin)
    },
  }
})()
