import { DescribeImagesCommand, type EC2Client, type Image } from '@aws-sdk/client-ec2'
import { getEC2Client } from '../lib/aws-client-factory'
import { searchSupportKnowledgeBase } from './support-knowledge'

const AMI_BUILDER_ACCOUNT_ID = '074573921684'
const DEFAULT_REGIONS = ['us-gov-west-1', 'us-gov-east-1']

export interface GoldenAmiEntry {
  os: string
  version: string
  architecture: string
  amiId: string
  region: string
  creationDate?: string
  hardening?: string
  documentation: Array<{ source?: string; content: string }>
  caveats: string[]
}

interface DocumentedFamily {
  os: string
  version: string
  architecture: string
  hardening?: string
  source?: string
  content: string
}

function normalized(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function imageTags(image: Image): Record<string, string> {
  return Object.fromEntries((image.Tags || []).flatMap(tag => tag.Key ? [[tag.Key, tag.Value || '']] : []))
}

export function isLiveGoldenImage(image: Image): boolean {
  const tags = imageTags(image)
  return tags.GD_Approved === 'Y' && tags.Release === 'Latest'
}

function valueFor(image: Image, tags: Record<string, string>, keys: string[]): string {
  for (const key of keys) if (tags[key]) return tags[key]
  return image.Name || image.Description || ''
}

function documentedFamilies(results: Array<{ content: string; source?: string }>): DocumentedFamily[] {
  const families: DocumentedFamily[] = []
  for (const result of results) {
    const text = result.content
    const os = text.match(/(?:OS|Operating System)\s*[:|-]\s*([^\n;|]+)/i)?.[1]?.trim()
    const version = text.match(/(?:Version|Release)\s*[:|-]\s*([^\n;|]+)/i)?.[1]?.trim()
    const architecture = text.match(/(?:Architecture|Arch)\s*[:|-]\s*([^\n;|]+)/i)?.[1]?.trim()
    if (os && version && architecture) {
      families.push({ os, version, architecture, source: result.source, content: text, hardening: text.match(/(?:Hardening|Baseline)\s*[:|-]\s*([^\n]+)/i)?.[1]?.trim() })
    }
  }
  return families
}

async function approvedImages(region: string): Promise<Image[]> {
  const client: EC2Client = await getEC2Client('govcloud', region, AMI_BUILDER_ACCOUNT_ID)
  const images: Image[] = []
  let nextToken: string | undefined
  do {
    const response = await client.send(new DescribeImagesCommand({
      Owners: ['self'],
      Filters: [
        { Name: 'tag:GD_Approved', Values: ['Y'] },
        { Name: 'tag:Release', Values: ['Latest'] }
      ],
      NextToken: nextToken,
      MaxResults: 100
    }))
    images.push(...(response.Images || []).filter(isLiveGoldenImage))
    nextToken = response.NextToken
  } while (nextToken)
  return images
}

export async function getGoldenAmis(regions = DEFAULT_REGIONS) {
  const docs = await searchSupportKnowledgeBase('approved Golden AMI families operating system version architecture hardening launch guidance', 10)
  const families = documentedFamilies(docs.results)
  const live = (await Promise.all(regions.map(async region =>
    (await approvedImages(region)).map(image => ({ image, region }))
  ))).flat()
  const matchedDocs = new Set<number>()
  const entries: GoldenAmiEntry[] = live.map(({ image, region }) => {
    const tags = imageTags(image)
    const os = valueFor(image, tags, ['OS', 'OperatingSystem', 'Platform'])
    const version = valueFor(image, tags, ['Version', 'OSVersion', 'ReleaseVersion'])
    const architecture = image.Architecture || tags.Architecture || 'unknown'
    const matches = families.filter((family, index) => {
      const match = normalized(family.os) === normalized(os) && normalized(family.version) === normalized(version) && normalized(family.architecture) === normalized(architecture)
      if (match) matchedDocs.add(index)
      return match
    })
    const caveats: string[] = []
    if (!matches.length) caveats.push('Live approved image has no matching documented OS/version/architecture family.')
    if (matches.length > 1) caveats.push('Multiple documentation passages match this OS/version/architecture family.')
    return {
      os: os || 'unknown', version: version || 'unknown', architecture,
      amiId: image.ImageId || 'unknown', region, creationDate: image.CreationDate,
      hardening: matches[0]?.hardening,
      documentation: matches.map(match => ({ source: match.source, content: match.content })),
      caveats
    }
  })
  const undocumentedFamilies = families.filter((_, index) => !matchedDocs.has(index)).map(family => ({
    os: family.os, version: family.version, architecture: family.architecture, source: family.source,
    caveat: 'Documented family has no matching live approved image.'
  }))
  return { entries, documentedFamiliesWithoutLiveImage: undocumentedFamilies, sources: { documentation: docs.knowledgeBase, amiBuilderAccountId: AMI_BUILDER_ACCOUNT_ID } }
}
