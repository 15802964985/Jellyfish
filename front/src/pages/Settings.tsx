import { Link } from 'react-router-dom'
import { Card, Form, Input, Select, Switch, Button, Space, message } from 'antd'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from 'react-i18next'

const Settings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common'])
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)

  const [form] = Form.useForm()

  const handleFinish = (values: { name: string; role: string; darkMode: boolean }) => {
    setUser({ name: values.name, role: values.role })
    message.success(t('settings.updated'))
  }

  return (
    <Card title={t('settings.title')} extra={<Space wrap><Link to="/web-generation"><Button>网页生成交接与导出</Button></Link><Link to="/settings/web-models"><Button>网页平台模型</Button></Link><Link to="/settings/web-accounts"><Button>网页平台账号</Button></Link><Link to="/settings/docker-images"><Button>Docker 镜像清单</Button></Link></Space>}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: user.name,
          role: user.role,
          darkMode: false,
        }}
        onFinish={handleFinish}
      >
        <Form.Item
          label={t('settings.nickname')}
          name="name"
          rules={[{ required: true, message: t('settings.validation.nicknameRequired') }]}
        >
          <Input placeholder={t('settings.nickname')} />
        </Form.Item>

        <Form.Item
          label={t('settings.role')}
          name="role"
          rules={[{ required: true, message: t('settings.validation.roleRequired') }]}
        >
          <Select
            options={[
              { label: t('settings.roleOptions.admin'), value: t('settings.roleOptions.admin') },
              {
                label: t('settings.roleOptions.operator'),
                value: t('settings.roleOptions.operator'),
              },
              { label: t('settings.roleOptions.guest'), value: t('settings.roleOptions.guest') },
            ]}
          />
        </Form.Item>

        <Form.Item
          label={t('settings.darkMode')}
          name="darkMode"
          valuePropName="checked"
          tooltip={t('settings.darkModeTooltip')}
        >
          <Switch />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            {t('common:save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default Settings

