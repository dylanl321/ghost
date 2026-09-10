<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Kiro Crew Configuration'
})

type RecordType = 'setting' | 'file' | 'secret'
interface EditableRecord {
  name: string
  type: RecordType
  mediaType?: 'text/plain' | 'application/json' | 'application/yaml'
  value: string
  configured?: boolean
  preserve?: boolean
}

const loading = ref(true)
const publishing = ref(false)
const error = ref('')
const revision = ref(0)
const updatedAt = ref<string | null>(null)
const records = ref<EditableRecord[]>([])

function encodeValue(record: any): string {
  if (record.type === 'setting') return JSON.stringify(record.value, null, 2)
  return record.value || ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch<any>('/api/admin/kirocrew/config')
    revision.value = result.revision || 0
    updatedAt.value = result.updatedAt
    records.value = (result.records || []).map((record: any) => ({
      name: record.name,
      type: record.type,
      mediaType: record.mediaType,
      value: encodeValue(record),
      configured: Boolean(record.configured),
      preserve: record.type === 'secret' && Boolean(record.configured)
    }))
  } catch (cause: any) {
    error.value = cause?.data?.message || cause?.message || 'Unable to load Kiro Crew configuration.'
  } finally {
    loading.value = false
  }
}

function addRecord() {
  records.value.push({ name: '', type: 'setting', value: '{}' })
}

function removeRecord(index: number) {
  records.value.splice(index, 1)
}

function changedSecret(record: EditableRecord) {
  record.preserve = false
}

async function publish() {
  publishing.value = true
  error.value = ''
  try {
    const payload = records.value.map(record => {
      if (record.type === 'secret' && record.preserve && !record.value) {
        return {
          name: record.name,
          type: 'secret',
          ...(record.mediaType ? { mediaType: record.mediaType } : {}),
          preserve: true
        }
      }
      if (record.type === 'setting') {
        return { name: record.name, type: record.type, value: JSON.parse(record.value) }
      }
      return {
        name: record.name,
        type: record.type,
        ...(record.mediaType ? { mediaType: record.mediaType } : {}),
        value: record.value
      }
    })
    await $fetch('/api/admin/kirocrew/config', {
      method: 'POST',
      body: { expectedRevision: revision.value, records: payload }
    })
    await load()
  } catch (cause: any) {
    error.value = cause?.data?.message || cause?.message || 'Unable to publish configuration.'
  } finally {
    publishing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="container mx-auto max-w-6xl px-6 py-8">
    <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" class="mb-4" to="/admin">
      Back to Dashboard
    </UButton>
    <div class="mb-6">
      <h1 class="text-3xl font-bold">Kiro Crew Configuration</h1>
      <p class="mt-2 text-gray-500">
        Publish one atomic revision of named settings, text files, and secrets.
        Secret values are write-only here.
      </p>
      <p class="mt-1 text-sm text-gray-500">
        Revision {{ revision }}<span v-if="updatedAt"> · {{ updatedAt }}</span>
      </p>
    </div>

    <UAlert v-if="error" color="red" variant="soft" :description="error" class="mb-4" />
    <div v-if="loading" class="py-12 text-center">Loading…</div>
    <template v-else>
      <div class="space-y-4">
        <UCard v-for="(record, index) in records" :key="`${record.name}-${index}`">
          <div class="grid gap-4 md:grid-cols-4">
            <UFormGroup label="Name">
              <UInput v-model="record.name" placeholder="kirocrew.organization" />
            </UFormGroup>
            <UFormGroup label="Type">
              <USelect v-model="record.type" :options="['setting', 'file', 'secret']" />
            </UFormGroup>
            <UFormGroup v-if="record.type !== 'setting'" label="Media type">
              <USelect
                v-model="record.mediaType"
                :options="['text/plain', 'application/json', 'application/yaml']"
              />
            </UFormGroup>
            <div class="flex items-end justify-end">
              <UButton color="red" variant="ghost" icon="i-heroicons-trash" @click="removeRecord(index)">
                Delete
              </UButton>
            </div>
          </div>
          <UFormGroup class="mt-4" :label="record.type === 'secret' ? 'Secret value' : 'Value'">
            <UTextarea
              v-model="record.value"
              :placeholder="record.type === 'secret' && record.configured ? 'Leave blank to preserve the current value' : ''"
              :rows="record.type === 'setting' ? 8 : 4"
              @input="record.type === 'secret' && changedSecret(record)"
            />
          </UFormGroup>
        </UCard>
      </div>
      <div class="mt-6 flex justify-between">
        <UButton variant="soft" icon="i-heroicons-plus" @click="addRecord">Add record</UButton>
        <UButton icon="i-heroicons-cloud-arrow-up" :loading="publishing" @click="publish">
          Publish revision
        </UButton>
      </div>
    </template>
  </div>
</template>
