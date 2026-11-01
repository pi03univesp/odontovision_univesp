# OdontoVision - Gestão Odontológica & Machine Learning

Sistema de gestão odontológica desenvolvido para otimizar a administração de clínicas e consultórios, integrando controle de agendamentos, prontuários de pacientes, controle de estoque e dashboard analítico com recursos de Inteligência Artificial.

---

## Sobre o Projeto

O **OdontoVision** foi desenvolvido para centralizar e automatizar os principais processos operacionais de uma clínica odontológica. A plataforma oferece uma interface intuitiva e segura para dentistas, administradores e equipe de apoio, permitindo um acompanhamento eficiente das consultas e dos insumos do consultório.

### Principais Funcionalidades

* **Gestão de Agenda e Consultas:** Agendamento de horários, acompanhamento de status (agendado, concluído, cancelado) e anotações clínicas.
* **Cadastro de Pacientes:** Prontuário e histórico de atendimento individualizado.
* **Controle de Estoque:** Monitoramento de materiais odontológicos em tempo real, registro de consumo e reposição, e alerta para níveis mínimos de estoque.
* **Dashboard de KPIs:** Indicadores de desempenho e relatórios visuais com gráficos dinâmicos.
* **Integração com Inteligência Artificial:** Análises preditivas e auxílio na tomada de decisão utilizando a API Google GenAI (Gemini).
* **Autenticação e Permissões:** Controle de acesso baseado em papéis de usuário (administrador, dentista e equipe de apoio) via Firebase.

---

## Tecnologias Utilizadas

* **Frontend:** React 19, TypeScript, Vite
* **Estilização e Animações:** Tailwind CSS v4, Lucide React (Ícones), Motion
* **Visualização de Dados:** Recharts
* **Banco de Dados e Autenticação:** Firebase (Firestore & Firebase Auth)
* **Manipulação de Datas:** date-fns

---

## Modelo de Dados (Firestore)

O sistema utiliza a seguinte estrutura no Firestore:

* **users:** Dados cadastrais e níveis de acesso (`admin`, `dentist`, `staff`).
* **patients:** Registros dos pacientes da clínica.
* **appointments:** Informações sobre as consultas agendadas e seus status.
* **materials:** Itens de estoque, incluindo estoque atual, mínimo e consumo médio.
* **inventoryLogs:** Histórico de entradas e saídas do estoque.

---

## Como Executar o Projeto Localmente

### Pré-requisitos

* Node.js (versão 18 ou superior)
* npm (gerenciador de pacotes do Node)

### Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/pi03univesp/odontovision_univesp.git
   cd odontovision_univesp
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configuração de variáveis de ambiente:
   Crie um arquivo `.env.local` na raiz do projeto e configure sua chave de API da IA:
   ```env
   GEMINI_API_KEY=sua_chave_aqui
   ```

4. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

O aplicativo estará disponível no navegador pelo endereço `http://localhost:3000` (ou na porta indicada no terminal).

---

## Scripts Disponíveis

* `npm run dev` - Inicia o servidor de desenvolvimento.
* `npm run build` - Gera a versão de produção na pasta `dist`.
* `npm run preview` - Executa uma prévia da versão de build localmente.
* `npm run lint` - Executa a verificação de tipos com o TypeScript.
* `npm run clean` - Remove os arquivos da pasta de build `dist`.
