"""Convert a finite Tiled JSON map to the docs/13 collision contract.

Usage: python scripts/collision_from_tiled.py export.tmj
Set string map properties region (rusty-creek), chunk (rc-0-0) and state
(clean/anomaly). Use an orthogonal 2160x720 map. Reference image layers are
ignored; object layer names and shapes follow docs/13. Box layers require
Tiled rectangles, not open polylines or polygons. Object properties supply
kind/id/damage; an object's name can supply id. Additional custom properties
(such as pickup item) are retained unchanged. No image data is read.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIZE = (2160, 720)
LAYERS = {
    'walk': 'walk', 'slide': 'slide', 'one-way': 'oneWay',
    'climb': 'climb', 'solid': 'solid', 'no-go': 'noGo',
    'hazard': 'hazard', 'interact': 'interact', 'spawn': 'spawn',
    'ledge': 'ledge', 'glide-lift': 'glideLift',
}
LINES = {'walk', 'slide', 'one-way'}
POINTS = {'spawn', 'ledge'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value, context):
    require(type(value) in (int, float) and math.isfinite(value)
            and value == int(value), f'{context}: expected integer stage pixels')
    return int(value)


def slug(value, context):
    require(isinstance(value, str) and re.fullmatch(r'[a-z][a-z0-9-]*', value),
            f'{context}: expected a lower-case name with dashes')
    return value


def properties(data):
    result = {}
    for prop in data.get('properties', []):
        require(prop['name'] not in result, f'duplicate property {prop["name"]}')
        result[prop['name']] = property_value(prop)
    return result


def property_value(prop):
    # Tiled 1.12 list entries carry type/value wrappers, unlike plain JSON arrays.
    if prop.get('type') == 'list':
        return [property_value(entry) for entry in prop['value']]
    return prop['value']


def point(x, y, context):
    x, y = integer(x, context), integer(y, context)
    require(0 <= x <= SIZE[0] and 0 <= y <= SIZE[1],
            f'{context}: point ({x}, {y}) outside 2160x720 chunk')
    return [x, y]


def convert(data):
    """Return (region, collision); reject unsupported authoring, never infer it."""
    require(data.get('type') == 'map' and data.get('orientation') == 'orthogonal'
            and not data.get('infinite', False), 'expected a finite orthogonal Tiled map')
    for axis, tile, expected in [('width', 'tilewidth', 2160), ('height', 'tileheight', 720)]:
        count, pixels = integer(data[axis], axis), integer(data[tile], tile)
        require(count > 0 and pixels > 0 and count * pixels == expected,
                'map must cover exactly 2160x720 stage pixels')
    meta = properties(data)
    region = slug(meta.get('region'), 'map region')
    chunk = slug(meta.get('chunk'), 'map chunk')
    state = meta.get('state')
    require(state in ('clean', 'anomaly'), 'map state must be clean or anomaly')
    result = {'chunk': chunk, 'state': state, 'size': list(SIZE),
              **{name: [] for name in LAYERS.values()}}
    identifiers = set()
    for layer in data['layers']:
        if layer.get('type') == 'imagelayer':
            continue  # The composed chunk is an authoring backdrop, never collision.
        name = layer.get('name')
        require(name in LAYERS, f'unknown collision layer {name!r}')
        require(layer.get('type') == 'objectgroup', f'{name}: expected an object layer')
        offset_x = integer(layer.get('offsetx', 0), name)
        offset_y = integer(layer.get('offsety', 0), name)
        require(layer.get('x', 0) == 0 and layer.get('y', 0) == 0,
                f'{name}: use pixel offsets, not tile offsets')
        for obj in layer['objects']:
            context = f'{name} object {obj.get("id", "?")}'
            require(obj.get('rotation', 0) == 0, f'{context}: rotation is unsupported')
            require(not any(key in obj for key in ('gid', 'template', 'text'))
                    and not obj.get('ellipse') and not obj.get('capsule'),
                    f'{context}: unsupported object shape')
            x, y = point(integer(obj['x'], context) + offset_x,
                         integer(obj['y'], context) + offset_y, context)
            if name in LINES:
                require('polyline' in obj and not obj.get('point') and 'polygon' not in obj,
                        f'{context}: expected a polyline')
                vertices = [point(x + p['x'], y + p['y'], context) for p in obj['polyline']]
                require(len(vertices) >= 2, f'{context}: polyline needs at least two points')
                require(all(a[0] < b[0] for a, b in zip(vertices, vertices[1:])),
                        f'{context}: polyline must run strictly left to right')
                result[LAYERS[name]].append(vertices)
                continue
            require('polyline' not in obj and 'polygon' not in obj,
                    f'{context}: expected a closed rectangle or point, not an open box')
            item = {'x': x, 'y': y}
            if name in POINTS:
                require(obj.get('point') is True and obj.get('width', 0) == 0
                        and obj.get('height', 0) == 0, f'{context}: expected a Tiled point')
            else:
                w, h = integer(obj['width'], context), integer(obj['height'], context)
                require(not obj.get('point') and w > 0 and h > 0,
                        f'{context}: rectangle must have positive width and height')
                point(x + w, y + h, context)
                item.update(w=w, h=h)
            props = properties(obj)
            require(not {'x', 'y', 'w', 'h'} & props.keys(),
                    f'{context}: custom properties cannot override geometry')
            # Encounter metadata belongs to the level author, not this converter.
            item.update({key: value for key, value in props.items() if key not in ('kind', 'id')})
            for field in ('kind', 'id'):
                value = props.get(field, obj.get('name') if field == 'id' else None)
                if value:
                    item[field] = slug(value, f'{context} {field}')
            required = {'climb': ('kind',), 'interact': ('kind', 'id'), 'spawn': ('kind', 'id')}
            for field in required.get(name, ()):
                require(field in item, f'{context}: missing {field} property')
            if 'id' in item:
                require(item['id'] not in identifiers, f'{context}: duplicate id {item["id"]}')
                identifiers.add(item['id'])
            if name == 'hazard':
                damage = integer(props.get('damage'), f'{context} damage')
                require(damage > 0, f'{context}: damage must be positive')
                item['damage'] = damage
            result[LAYERS[name]].append(item)
    return region, result


def write_collision(source, root=ROOT):
    region, collision = convert(json.loads(Path(source).read_text(encoding='utf-8-sig')))
    output = Path(root) / 'art' / 'stages' / region / f'{collision["chunk"]}.{collision["state"]}.collision.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(collision, indent=2) + '\n', encoding='utf-8')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Tiled JSON map (.tmj or .json)')
    args = parser.parse_args()
    try:
        print(write_collision(args.source))
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f'Collision export failed: {error}\n')


if __name__ == '__main__':
    main()
